// src/index.ts
var SSO_STATE_KEY = "ias_sso_state";
var PKCE_VERIFIER_KEY = "ias_sso_pkce_verifier";
async function generatePKCEChallenge(verifier) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function generateRandomString() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
var SSOClient = class {
  constructor(options) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.redirectUri = options.redirectUri ?? `${window.location.origin}/auth/callback`;
    this.usePKCE = options.usePKCE ?? true;
  }
  /**
   * Initiates the SSO login flow. Redirects the user to the auth frontend.
   */
  async login() {
    const state = generateRandomString();
    sessionStorage.setItem(SSO_STATE_KEY, state);
    const params = new URLSearchParams({
      redirect_uri: this.redirectUri,
      state
    });
    if (this.usePKCE) {
      const verifier = generateRandomString();
      sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
      const challenge = await generatePKCEChallenge(verifier);
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }
    window.location.href = `${this.apiUrl}/auth/sso/authorize?${params}`;
  }
  /**
   * Handles the callback after the user authenticates.
   * Call this on your redirect_uri page. Validates state, exchanges
   * the authorization code for a JWT, and cleans up session storage.
   */
  async handleCallback(searchParams) {
    const params = searchParams ?? new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    const savedState = sessionStorage.getItem(SSO_STATE_KEY);
    if (!code) {
      throw new Error("Missing authorization code in callback URL");
    }
    if (!returnedState || returnedState !== savedState) {
      throw new Error("State mismatch \u2014 possible CSRF attack");
    }
    const body = { code };
    if (this.usePKCE) {
      const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
      if (!verifier) {
        throw new Error("Missing PKCE verifier \u2014 login flow may have been interrupted");
      }
      body.code_verifier = verifier;
    }
    const res = await fetch(`${this.apiUrl}/auth/sso/token/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Token exchange failed" }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    sessionStorage.removeItem(SSO_STATE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    return res.json();
  }
};
export {
  SSOClient
};
//# sourceMappingURL=index.js.map