export interface SSOClientOptions {
  /** Base URL of the authorization server (e.g. https://auth.inferencelabs.com) */
  authBaseUrl: string
  /** Callback URL on your app that receives the authorization code. Defaults to `${origin}/auth/callback` */
  redirectUri?: string
  /** Enable PKCE (S256). Defaults to true. */
  usePKCE?: boolean
}

export interface SSOUser {
  id: string
  username: string
  email: string
}

export interface TokenExchangeResult {
  success: boolean
  jwt: string
  user: SSOUser
}

const SSO_STATE_KEY = 'ias_sso_state'
const PKCE_VERIFIER_KEY = 'ias_sso_pkce_verifier'

async function generatePKCEChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateRandomString(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class SSOClient {
  private authBaseUrl: string
  private redirectUri: string
  private usePKCE: boolean

  constructor(options: SSOClientOptions) {
    this.authBaseUrl = options.authBaseUrl.replace(/\/$/, '')
    this.redirectUri = options.redirectUri ?? `${window.location.origin}/auth/callback`
    this.usePKCE = options.usePKCE ?? true
  }

  /**
   * Initiates the SSO login flow. Redirects the user to the auth frontend.
   */
  async login(): Promise<void> {
    const state = generateRandomString()
    localStorage.setItem(SSO_STATE_KEY, state)

    const params = new URLSearchParams({
      redirect_uri: this.redirectUri,
      state,
    })

    if (this.usePKCE) {
      const verifier = generateRandomString()
      localStorage.setItem(PKCE_VERIFIER_KEY, verifier)
      const challenge = await generatePKCEChallenge(verifier)
      params.set('code_challenge', challenge)
      params.set('code_challenge_method', 'S256')
    }

    window.location.href = `${this.authBaseUrl}/auth/sso/authorize?${params}`
  }

  /**
   * Handles the callback after the user authenticates.
   * Call this on your redirect_uri page. Validates state, exchanges
   * the authorization code for a JWT, and cleans up local storage.
   */
  async handleCallback(searchParams?: URLSearchParams): Promise<TokenExchangeResult> {
    const params = searchParams ?? new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')
    const savedState = localStorage.getItem(SSO_STATE_KEY)

    if (!code) {
      throw new Error('Missing authorization code in callback URL')
    }

    if (!returnedState || returnedState !== savedState) {
      throw new Error('State mismatch — possible CSRF attack')
    }

    const body: Record<string, string> = { code }

    if (this.usePKCE) {
      const verifier = localStorage.getItem(PKCE_VERIFIER_KEY)
      if (!verifier) {
        throw new Error('Missing PKCE verifier — login flow may have been interrupted')
      }
      body.code_verifier = verifier
    }

    const res = await fetch(`${this.authBaseUrl}/auth/sso/token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Token exchange failed' }))
      throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
    }

    localStorage.removeItem(SSO_STATE_KEY)
    localStorage.removeItem(PKCE_VERIFIER_KEY)

    return res.json()
  }
}
