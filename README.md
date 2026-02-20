# @inference-labs-inc/sso-client

SSO client for Inference Labs auth. Handles the full authorize, callback, and token exchange flow with PKCE.

> 📖 **For detailed technical documentation** about the SSO flow architecture, system interactions, and implementation details, see [SSO_FLOW.md](./SSO_FLOW.md). This document covers the complete flow between the API Worker, Auth Frontend, and External Apps, including sequence diagrams and configuration requirements.

## Installation

```bash
pnpm add github:inference-labs-inc/ias-sso-client
```

## Usage

### 1. Create the client

```typescript
import { SSOClient } from '@inference-labs-inc/sso-client'

const sso = new SSOClient({
  authBaseUrl: 'https://auth.inferencelabs.com',
})
```

### 2. Trigger login

Call `login()` when the user clicks your sign-in button. This redirects them to the Inference Labs auth frontend where they authenticate via Google, GitHub, X, or email.

```typescript
await sso.login()
```

The user is redirected to `${origin}/auth/callback` by default after authenticating. Override this with the `redirectUri` option if your callback lives elsewhere.

### 3. Handle the callback

On your `/auth/callback` page, call `handleCallback()` to exchange the authorization code for a JWT. It validates the state parameter, sends the PKCE verifier, and returns the authenticated user.

```typescript
const { jwt, user } = await sso.handleCallback()
// user: { id, username, email }
```

### Full example (React)

```tsx
// src/pages/Login.tsx
import { SSOClient } from '@inference-labs-inc/sso-client'

const sso = new SSOClient({
  authBaseUrl: 'https://auth.inferencelabs.com',
})

export function Login() {
  return <button onClick={() => sso.login()}>Sign in</button>
}
```

```tsx
// src/pages/AuthCallback.tsx
import { useEffect, useRef, useState } from 'react'
import { SSOClient } from '@inference-labs-inc/sso-client'

const sso = new SSOClient({
  authBaseUrl: 'https://auth.inferencelabs.com',
})

export function AuthCallback() {
  const called = useRef(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (called.current) return
    called.current = true

    sso.handleCallback()
      .then(({ jwt, user }) => {
        localStorage.setItem('token', jwt)
        window.location.href = '/'
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p>Authentication failed: {error}</p>
  return <p>Signing in...</p>
}
```

> The `useRef` guard prevents React 18 StrictMode from double-firing the effect and consuming the one-time authorization code twice.

## API

### `new SSOClient(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `authBaseUrl` | `string` | **required** | Base URL of the authorization server |
| `redirectUri` | `string` | `${origin}/auth/callback` | Where the user is sent after authenticating |
| `usePKCE` | `boolean` | `true` | Enable PKCE (S256) challenge |

### `sso.login(): Promise<void>`

Generates state + PKCE verifier, stores them in `localStorage`, and redirects the user to the SSO authorize endpoint.

### `sso.handleCallback(searchParams?: URLSearchParams): Promise<TokenExchangeResult>`

Validates state, exchanges the authorization code (with PKCE verifier) for a JWT, cleans up `localStorage`, and returns:

```typescript
interface TokenExchangeResult {
  success: boolean
  jwt: string
  user: {
    id: string
    username: string
    email: string
  }
}
```

Pass custom `URLSearchParams` if your framework strips them from `window.location.search` (e.g. server-side rendering).
