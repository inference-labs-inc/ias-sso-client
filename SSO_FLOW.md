# IAS SSO & OAuth Flow

Three distinct systems talk to each other. Keep them straight or you will suffer.

| System | URL | What it is |
|---|---|---|
| **API Worker** | `api.truthtensor.com` / `staging.api.truthtensor.com` | Cloudflare Worker (Hono). Owns all auth logic. |
| **Auth Frontend** | `auth.inferencelabs.com` / `staging-auth.inferencelabs.com` | React SPA. The login UI. Talks to the API Worker. |
| **External App** | `truthtensor.com`, `sertn.ai`, etc. | The consumer. Uses `ias-sso-client.ts` to initiate SSO. |

---

## SSO Flow (full, cross-domain login)

This is what happens when a user clicks "Login" on an external app and gets bounced through the auth frontend.

```
External App                  API Worker                    Auth Frontend             OAuth Provider (X/GitHub)
     │                             │                               │                          │
     │  SSOClient.login()          │                               │                          │
     │  → GET /auth/sso/authorize  │                               │                          │
     │    ?redirect_uri=app/cb     │                               │                          │
     │    &state=...               │                               │                          │
     │    &code_challenge=...      │                               │                          │
     ├────────────────────────────►│                               │                          │
     │                             │  store SSORequest in KV       │                          │
     │                             │  (redirect_uri, state, PKCE)  │                          │
     │                             │                               │                          │
     │                             │  302 /login                   │                          │
     │                             │    ?sso={request_id}          │                          │
     │                             │    &from={app_origin}         │                          │
     │◄────────────────────────────┤──────────────────────────────►│                          │
     │                             │                               │                          │
     │                             │                               │  Login.tsx mounts        │
     │                             │                               │  stores sso_request_id   │
     │                             │                               │  in sessionStorage       │
     │                             │                               │                          │
     │                             │                               │  user clicks "Continue   │
     │                             │                               │  with X"                 │
     │                             │                               │                          │
     │                             │  GET /auth/x                  │                          │
     │                             │    ?callback_uri=auth.../     │                          │
     │                             │      auth/x/callback          │                          │
     │                             │◄──────────────────────────────┤                          │
     │                             │                               │                          │
     │                             │  generate PKCE, store in KV   │                          │
     │                             │  302 → x.com/oauth2/authorize │                          │
     │                             │    redirect_uri=auth.../      │                          │
     │                             │      auth/x/callback          │                          │
     │                             ├──────────────────────────────────────────────────────────►
     │                             │                               │                          │
     │                             │                               │  user authenticates      │
     │                             │                               │                          │
     │                             │                               │  302 auth.../            │
     │                             │                               │    auth/x/callback       │
     │                             │                               │      ?code=...&state=... │
     │                             │◄──────────────────────────────────────────────────────────
     │                             │                               │                          │
     │                             │                               │  OAuthCallback.tsx       │
     │                             │                               │  GET /auth/x/callback    │
     │                             │                               │    ?code=...&state=...   │
     │                             │◄──────────────────────────────┤                          │
     │                             │                               │                          │
     │                             │  exchange code → X token      │                          │
     │                             │  fetch X user info            │                          │
     │                             │  create/get user in DB        │                          │
     │                             │  return { jwt, user }         │                          │
     │                             ├──────────────────────────────►│                          │
     │                             │                               │                          │
     │                             │                               │  completeSSOFlow(jwt)    │
     │                             │                               │  read sso_request_id     │
     │                             │                               │  from sessionStorage     │
     │                             │                               │                          │
     │                             │  POST /auth/sso/callback      │                          │
     │                             │    { sso_request_id, jwt }    │                          │
     │                             │◄──────────────────────────────┤                          │
     │                             │                               │                          │
     │                             │  verify JWT                   │                          │
     │                             │  create SSO session cookie    │                          │
     │                             │  generate auth code           │                          │
     │                             │  return { redirect_url }      │                          │
     │                             │  (app/callback?code=...       │                          │
     │                             │    &state=...)                │                          │
     │                             ├──────────────────────────────►│                          │
     │                             │                               │                          │
     │                             │                               │  window.location.href    │
     │                             │                               │    = redirect_url        │
     │                             │◄──────────────────────────────┤                          │
     │                             │                               │                          │
     │  /callback?code=...         │                               │                          │
     │    &state=...               │                               │                          │
     │                             │                               │                          │
     │  SSOClient.handleCallback() │                               │                          │
     │  validate state (CSRF)      │                               │                          │
     │  POST /auth/sso/token/      │                               │                          │
     │    exchange { code,         │                               │                          │
     │    code_verifier }          │                               │                          │
     ├────────────────────────────►│                               │                          │
     │                             │  validate PKCE                │                          │
     │                             │  look up auth code            │                          │
     │                             │  generate JWT                 │                          │
     │                             │  return { jwt, user }         │                          │
     │◄────────────────────────────┤                               │                          │
     │                             │                               │                          │
     │  user is logged in ✓        │                               │                          │
```

### Returning users (active SSO session)

If the user already has a `__Host-session` cookie on the API domain, `GET /auth/sso/authorize` skips the login page entirely — it issues an auth code immediately and redirects straight back to the external app. The whole middle section of the diagram above is bypassed.

---

## Direct OAuth (no SSO)

When a user logs into the auth frontend directly (not from an external app), `sso_request_id` is not in sessionStorage. The flow is identical up to `completeSSOFlow`, which returns `null`. OAuthCallback shows "You are signed in. You can close this tab." This is correct behaviour.

---

## Key Files

| File | Role |
|---|---|
| `src/auth/sso/sso.ts` | `handleAuthorize`, `handleSSOCallback`, `handleTokenExchange` — the SSO state machine |
| `src/auth/sso/sso.api.ts` | Hono routes for `/auth/sso/*` |
| `src/auth/sso/0auth.x.ts` | X OAuth redirect + code exchange |
| `src/auth/sso/0auth.github.ts` | GitHub OAuth redirect + code exchange |
| `frontend/src/lib/sso.ts` | Auth frontend helpers: `storeSSORequestId`, `completeSSOFlow` |
| `frontend/src/lib/sso-client.ts` | The npm package consumed by external apps (`SSOClient`) |
| `frontend/src/pages/Login.tsx` | Stores `sso_request_id` from URL params into sessionStorage |
| `frontend/src/pages/OAuthCallback.tsx` | Handles OAuth provider redirect, calls `completeSSOFlow` |

---

## Configuration

### API Worker (`wrangler.toml`)

`AUTH_FRONTEND_URL` controls where `GET /auth/sso/authorize` redirects unauthenticated users. Must match the actual deployed URL of the auth frontend for that environment.

| Environment | Value |
|---|---|
| Production | `https://auth.inferencelabs.com` |
| Staging | `https://staging-auth.inferencelabs.com` |
| Local dev | Set `AUTH_FRONTEND_URL=http://localhost:5174` in `.dev.vars` |

`ALLOWED_ORIGINS` must include the auth frontend URL — this is what validates the `callback_uri` parameter passed by the auth frontend when initiating X/GitHub OAuth.

### External App (SSOClient)

```ts
const sso = new SSOClient({
  authBaseUrl: 'https://api.truthtensor.com',  // API Worker URL, NOT the auth frontend
  redirectUri: `${window.location.origin}/auth/callback`,
})
```

`authBaseUrl` **must** point to the API Worker. If it points to the auth frontend, the authorize route won't exist, the SPA catch-all will redirect to `/login` with no params, and `sso_request_id` will never be stored — the SSO redirect back to the app will silently not happen.

### Auth Frontend (`frontend/.env`)

`VITE_API_URL` must point to the API Worker for the environment being built.

---

## Allowed Origins / Redirect URIs

Two separate allow-lists exist and must be kept in sync:

**Backend** (`src/auth/sso/sso.ts` → `ALLOWED_REDIRECT_URIS`): controls which `redirect_uri` values external apps may pass to `/auth/sso/authorize`.

**Frontend** (`frontend/src/lib/sso.ts` → `ALLOWED_SERVICES`): controls which `from` origins the login page will accept, and maps them to display names and icons.

Adding a new external app requires an entry in both.
