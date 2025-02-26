import { WebPlugin } from '@capacitor/core';
import type { SocialLoginPlugin, InitializeOptions, LoginOptions, AuthorizationCode, isLoggedInOptions, AuthorizationCodeOptions, ProviderResponseMap } from './definitions';
export declare class SocialLoginWeb extends WebPlugin implements SocialLoginPlugin {
    private static readonly OAUTH_STATE_KEY;
    private googleClientId;
    private appleClientId;
    private googleScriptLoaded;
    private googleLoginType;
    private appleScriptLoaded;
    private appleScriptUrl;
    private GOOGLE_TOKEN_REQUEST_URL;
    private facebookAppId;
    private facebookScriptLoaded;
    constructor();
    private handleOAuthRedirect;
    initialize(options: InitializeOptions): Promise<void>;
    login<T extends LoginOptions['provider']>(options: Extract<LoginOptions, {
        provider: T;
    }>): Promise<{
        provider: T;
        result: ProviderResponseMap[T];
    }>;
    logout(options: {
        provider: 'apple' | 'google' | 'facebook';
    }): Promise<void>;
    private accessTokenIsValid;
    private idTokenValid;
    private rawLogoutGoogle;
    isLoggedIn(options: isLoggedInOptions): Promise<{
        isLoggedIn: boolean;
    }>;
    getAuthorizationCode(options: AuthorizationCodeOptions): Promise<AuthorizationCode>;
    refresh(options: LoginOptions): Promise<void>;
    private loginWithGoogle;
    private parseJwt;
    private loadGoogleScript;
    private loginWithApple;
    private loadAppleScript;
    private clearStateGoogle;
    private getGoogleState;
    private loadFacebookScript;
    private loginWithFacebook;
    private fallbackToTraditionalOAuth;
}
