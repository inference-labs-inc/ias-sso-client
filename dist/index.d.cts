interface SSOClientOptions {
    /** Base URL of the auth API worker (e.g. https://api.auth.inferencelabs.com) */
    apiUrl: string;
    /** Callback URL on your app that receives the authorization code. Defaults to `${origin}/auth/callback` */
    redirectUri?: string;
    /** Enable PKCE (S256). Defaults to true. */
    usePKCE?: boolean;
}
interface SSOUser {
    id: string;
    username: string;
    email: string;
}
interface TokenExchangeResult {
    success: boolean;
    jwt: string;
    user: SSOUser;
}
declare class SSOClient {
    private apiUrl;
    private redirectUri;
    private usePKCE;
    constructor(options: SSOClientOptions);
    /**
     * Initiates the SSO login flow. Redirects the user to the auth frontend.
     */
    login(): Promise<void>;
    /**
     * Handles the callback after the user authenticates.
     * Call this on your redirect_uri page. Validates state, exchanges
     * the authorization code for a JWT, and cleans up session storage.
     */
    handleCallback(searchParams?: URLSearchParams): Promise<TokenExchangeResult>;
}

export { SSOClient, type SSOClientOptions, type SSOUser, type TokenExchangeResult };
