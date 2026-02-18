interface SSOClientOptions {
    /** Base URL of the authorization server (e.g. https://auth.inferencelabs.com) */
    authBaseUrl: string;
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
    private authBaseUrl;
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
