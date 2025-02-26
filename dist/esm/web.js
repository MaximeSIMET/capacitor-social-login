import { WebPlugin } from '@capacitor/core';
export class SocialLoginWeb extends WebPlugin {
    constructor() {
        var _a;
        super();
        this.googleClientId = null;
        this.appleClientId = null;
        this.googleScriptLoaded = false;
        this.googleLoginType = 'online';
        this.appleScriptLoaded = false;
        this.appleScriptUrl = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
        this.GOOGLE_TOKEN_REQUEST_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
        this.facebookAppId = null;
        this.facebookScriptLoaded = false;
        // Set up listener for OAuth redirects if we have a pending OAuth flow
        if (localStorage.getItem(SocialLoginWeb.OAUTH_STATE_KEY)) {
            console.log('OAUTH_STATE_KEY found');
            const result = this.handleOAuthRedirect();
            if (result) {
                (_a = window.opener) === null || _a === void 0 ? void 0 : _a.postMessage(Object.assign({ type: 'oauth-response' }, result.result), window.location.origin);
                window.close();
            }
        }
    }
    handleOAuthRedirect() {
        const paramsRaw = new URL(window.location.href).searchParams;
        const code = paramsRaw.get('code');
        if (code && paramsRaw.has('scope')) {
            return {
                provider: 'google',
                result: {
                    provider: 'google',
                    result: {
                        serverAuthCode: code,
                    },
                },
            };
        }
        const hash = window.location.hash.substring(1);
        console.log('handleOAuthRedirect', window.location.hash);
        if (!hash)
            return;
        console.log('handleOAuthRedirect ok');
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const idToken = params.get('id_token');
        if (accessToken && idToken) {
            localStorage.removeItem(SocialLoginWeb.OAUTH_STATE_KEY);
            const profile = this.parseJwt(idToken);
            return {
                provider: 'google',
                result: {
                    accessToken: {
                        token: accessToken,
                    },
                    idToken,
                    profile: {
                        email: profile.email || null,
                        familyName: profile.family_name || null,
                        givenName: profile.given_name || null,
                        id: profile.sub || null,
                        name: profile.name || null,
                        imageUrl: profile.picture || null,
                    },
                },
            };
        }
        return null;
    }
    async initialize(options) {
        var _a, _b, _c;
        if ((_a = options.google) === null || _a === void 0 ? void 0 : _a.webClientId) {
            this.googleClientId = options.google.webClientId;
            if (options.google.mode) {
                this.googleLoginType = options.google.mode;
            }
            await this.loadGoogleScript();
        }
        if ((_b = options.apple) === null || _b === void 0 ? void 0 : _b.clientId) {
            this.appleClientId = options.apple.clientId;
            await this.loadAppleScript();
        }
        if ((_c = options.facebook) === null || _c === void 0 ? void 0 : _c.appId) {
            this.facebookAppId = options.facebook.appId;
            await this.loadFacebookScript();
            FB.init({
                appId: this.facebookAppId,
                version: 'v17.0',
                xfbml: true,
                cookie: true,
            });
        }
        // Implement initialization for other providers if needed
    }
    async login(options) {
        switch (options.provider) {
            case 'google':
                return this.loginWithGoogle(options.options);
            case 'apple':
                return this.loginWithApple(options.options);
            case 'facebook':
                return this.loginWithFacebook(options.options);
            default:
                throw new Error(`Login for ${options.provider} is not implemented on web`);
        }
    }
    async logout(options) {
        switch (options.provider) {
            case 'google':
                if (this.googleLoginType === 'offline') {
                    return Promise.reject("Offline login doesn't store tokens. logout is not available");
                }
                // Google doesn't have a specific logout method for web
                // We can revoke the token if we have it stored
                console.log('Google logout: Id token should be revoked on the client side if stored');
                // eslint-disable-next-line
                const state = this.getGoogleState();
                if (!state)
                    return;
                await this.rawLogoutGoogle(state.accessToken);
                break;
            case 'apple':
                // Apple doesn't provide a logout method for web
                console.log('Apple logout: Session should be managed on the client side');
                break;
            case 'facebook':
                return new Promise((resolve) => {
                    FB.logout(() => resolve());
                });
            default:
                throw new Error(`Logout for ${options.provider} is not implemented`);
        }
    }
    async accessTokenIsValid(accessToken) {
        const url = `${this.GOOGLE_TOKEN_REQUEST_URL}?access_token=${encodeURIComponent(accessToken)}`;
        try {
            // Make the GET request using fetch
            const response = await fetch(url);
            // Check if the response is successful
            if (!response.ok) {
                console.log(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response not successful. Status code: ${response.status}. Assuming that the token is not valid`);
                return false;
            }
            // Get the response body as text
            const responseBody = await response.text();
            if (!responseBody) {
                console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is null`);
                throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is null`);
            }
            // Parse the response body as JSON
            let jsonObject;
            try {
                jsonObject = JSON.parse(responseBody);
            }
            catch (e) {
                console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is not valid JSON. Error: ${e}`);
                throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response body is not valid JSON. Error: ${e}`);
            }
            // Extract the 'expires_in' field
            const expiresInStr = jsonObject['expires_in'];
            if (expiresInStr === undefined || expiresInStr === null) {
                console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response JSON does not include 'expires_in'.`);
                throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. Response JSON does not include 'expires_in'.`);
            }
            // Parse 'expires_in' as an integer
            let expiresInInt;
            try {
                expiresInInt = parseInt(expiresInStr, 10);
                if (isNaN(expiresInInt)) {
                    throw new Error(`'expires_in' is not a valid integer`);
                }
            }
            catch (e) {
                console.error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. 'expires_in': ${expiresInStr} is not a valid integer. Error: ${e}`);
                throw new Error(`Invalid response from ${this.GOOGLE_TOKEN_REQUEST_URL}. 'expires_in': ${expiresInStr} is not a valid integer. Error: ${e}`);
            }
            // Determine if the access token is valid based on 'expires_in'
            return expiresInInt > 5;
        }
        catch (error) {
            console.error(error);
            throw error;
        }
    }
    idTokenValid(idToken) {
        try {
            const parsed = this.parseJwt(idToken);
            const currentTime = Math.ceil(Date.now() / 1000) + 5; // Convert current time to seconds since epoch
            return parsed.exp && currentTime < parsed.exp;
        }
        catch (e) {
            return false;
        }
    }
    async rawLogoutGoogle(accessToken, tokenValid = null) {
        if (tokenValid === null) {
            tokenValid = await this.accessTokenIsValid(accessToken);
        }
        if (tokenValid === true) {
            return new Promise((resolve, reject) => {
                try {
                    google.accounts.oauth2.revoke(accessToken, async () => {
                        this.clearStateGoogle();
                        resolve();
                    });
                }
                catch (e) {
                    reject(e);
                }
            });
        }
        else {
            this.clearStateGoogle();
            return;
        }
    }
    async isLoggedIn(options) {
        switch (options.provider) {
            case 'google':
                if (this.googleLoginType === 'offline') {
                    return Promise.reject("Offline login doesn't store tokens. isLoggedIn is not available");
                }
                // For Google, we can check if there's a valid token
                // eslint-disable-next-line
                const state = this.getGoogleState();
                if (!state)
                    return { isLoggedIn: false };
                try {
                    // todo: cache accessTokenIsValid calls
                    const isValidAccessToken = await this.accessTokenIsValid(state.accessToken);
                    const isValidIdToken = this.idTokenValid(state.idToken);
                    if (isValidAccessToken && isValidIdToken) {
                        return { isLoggedIn: true };
                    }
                    else {
                        try {
                            await this.rawLogoutGoogle(state.accessToken, false);
                        }
                        catch (e) {
                            console.error('Access token is not valid, but cannot logout', e);
                        }
                        return { isLoggedIn: false };
                    }
                }
                catch (e) {
                    return Promise.reject(e);
                }
            case 'apple':
                // Apple doesn't provide a method to check login status on web
                console.log('Apple login status should be managed on the client side');
                return { isLoggedIn: false };
            case 'facebook':
                return new Promise((resolve) => {
                    FB.getLoginStatus((response) => {
                        resolve({ isLoggedIn: response.status === 'connected' });
                    });
                });
            default:
                throw new Error(`isLoggedIn for ${options.provider} is not implemented`);
        }
    }
    async getAuthorizationCode(options) {
        switch (options.provider) {
            case 'google':
                if (this.googleLoginType === 'offline') {
                    return Promise.reject("Offline login doesn't store tokens. getAuthorizationCode is not available");
                }
                // For Google, we can use the id_token as the authorization code
                // eslint-disable-next-line
                const state = this.getGoogleState();
                if (!state)
                    throw new Error('No Google authorization code available');
                try {
                    // todo: cache accessTokenIsValid calls
                    const isValidAccessToken = await this.accessTokenIsValid(state.accessToken);
                    const isValidIdToken = this.idTokenValid(state.idToken);
                    if (isValidAccessToken && isValidIdToken) {
                        return { accessToken: state.accessToken, jwt: state.idToken };
                    }
                    else {
                        try {
                            await this.rawLogoutGoogle(state.accessToken, false);
                        }
                        catch (e) {
                            console.error('Access token is not valid, but cannot logout', e);
                        }
                        throw new Error('No Google authorization code available');
                    }
                }
                catch (e) {
                    return Promise.reject(e);
                }
            case 'apple':
                // Apple authorization code should be obtained during login
                console.log('Apple authorization code should be stored during login');
                throw new Error('Apple authorization code not available');
            case 'facebook':
                return new Promise((resolve, reject) => {
                    FB.getLoginStatus((response) => {
                        var _a;
                        if (response.status === 'connected') {
                            resolve({ jwt: ((_a = response.authResponse) === null || _a === void 0 ? void 0 : _a.accessToken) || '' });
                        }
                        else {
                            reject(new Error('No Facebook authorization code available'));
                        }
                    });
                });
            default:
                throw new Error(`getAuthorizationCode for ${options.provider} is not implemented`);
        }
    }
    async refresh(options) {
        switch (options.provider) {
            case 'google':
                // For Google, we can prompt for re-authentication
                return Promise.reject('Not implemented');
            case 'apple':
                // Apple doesn't provide a refresh method for web
                console.log('Apple refresh not available on web');
                break;
            case 'facebook':
                await this.loginWithFacebook(options.options);
                break;
            default:
                throw new Error(`Refresh for ${options.provider} is not implemented`);
        }
    }
    loginWithGoogle(options) {
        if (!this.googleClientId) {
            throw new Error('Google Client ID not set. Call initialize() first.');
        }
        let scopes = options.scopes || [];
        if (scopes.length > 0) {
            // If scopes are provided, directly use the traditional OAuth flow
            if (!scopes.includes('https://www.googleapis.com/auth/userinfo.email')) {
                scopes.push('https://www.googleapis.com/auth/userinfo.email');
            }
            if (!scopes.includes('https://www.googleapis.com/auth/userinfo.profile')) {
                scopes.push('https://www.googleapis.com/auth/userinfo.profile');
            }
            if (!scopes.includes('openid')) {
                scopes.push('openid');
            }
        }
        else {
            scopes = [
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile',
                'openid',
            ];
        }
        if (scopes.length > 3 || this.googleLoginType === 'offline' || options.disableOneTap) {
            // If scopes are provided, directly use the traditional OAuth flow
            this.fallbackToTraditionalOAuth();
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            google.accounts.id.initialize({
                client_id: this.googleClientId,
                callback: (response) => {
                    console.log('google.accounts.id.initialize callback', response);
                    if (response.error) {
                        // we use any because type fail but we need to double check if that works
                        reject(response.error);
                    }
                    else {
                        const payload = this.parseJwt(response.credential);
                        const result = {
                            accessToken: null,
                            responseType: 'online',
                            idToken: response.credential,
                            profile: {
                                email: payload.email || null,
                                familyName: payload.family_name || null,
                                givenName: payload.given_name || null,
                                id: payload.sub || null,
                                name: payload.name || null,
                                imageUrl: payload.picture || null,
                            },
                        };
                        resolve({ provider: 'google', result });
                    }
                },
                auto_select: true,
            });
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    console.log('OneTap is not displayed or skipped');
                    // Fallback to traditional OAuth if One Tap is not available
                    this.fallbackToTraditionalOAuth();
                    return Promise.resolve();
                }
                else {
                    console.log('OneTap is displayed');
                }
            });
        });
    }
    parseJwt(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64)
            .split('')
            .map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
            .join(''));
        return JSON.parse(jsonPayload);
    }
    async loadGoogleScript() {
        if (this.googleScriptLoaded)
            return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.onload = () => {
                this.googleScriptLoaded = true;
                resolve();
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
    async loginWithApple(options) {
        if (!this.appleClientId) {
            throw new Error('Apple Client ID not set. Call initialize() first.');
        }
        if (!this.appleScriptLoaded) {
            throw new Error('Apple Sign-In script not loaded.');
        }
        return new Promise((resolve, reject) => {
            var _a;
            AppleID.auth.init({
                clientId: this.appleClientId,
                scope: ((_a = options.scopes) === null || _a === void 0 ? void 0 : _a.join(' ')) || 'name email',
                redirectURI: options.redirectUrl || window.location.href,
                state: options.state,
                nonce: options.nonce,
                usePopup: true,
            });
            AppleID.auth
                .signIn()
                .then((res) => {
                var _a, _b, _c, _d, _e, _f, _g;
                const result = {
                    profile: {
                        user: ((_b = (_a = res.user) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.firstName) ? `${res.user.name.firstName} ${res.user.name.lastName}` : '',
                        email: ((_c = res.user) === null || _c === void 0 ? void 0 : _c.email) || null,
                        givenName: ((_e = (_d = res.user) === null || _d === void 0 ? void 0 : _d.name) === null || _e === void 0 ? void 0 : _e.firstName) || null,
                        familyName: ((_g = (_f = res.user) === null || _f === void 0 ? void 0 : _f.name) === null || _g === void 0 ? void 0 : _g.lastName) || null,
                    },
                    accessToken: {
                        token: res.authorization.code, // TODO: to fix and find the correct token
                    },
                    idToken: res.authorization.id_token || null,
                };
                resolve({ provider: 'apple', result });
            })
                .catch((error) => {
                reject(error);
            });
        });
    }
    async loadAppleScript() {
        if (this.appleScriptLoaded)
            return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = this.appleScriptUrl;
            script.async = true;
            script.onload = () => {
                this.appleScriptLoaded = true;
                resolve();
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
    clearStateGoogle() {
        try {
            window.localStorage.removeItem('capgo_social_login_google_state');
        }
        catch (e) {
            console.error('Cannot clear state google', e);
        }
    }
    getGoogleState() {
        try {
            const state = window.localStorage.getItem('capgo_social_login_google_state');
            if (!state)
                return null;
            const { accessToken, idToken } = JSON.parse(state);
            return { accessToken, idToken };
        }
        catch (e) {
            console.error('Cannot get state google', e);
            return null;
        }
    }
    async loadFacebookScript() {
        if (this.facebookScriptLoaded)
            return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://connect.facebook.net/en_US/sdk.js';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                this.facebookScriptLoaded = true;
                resolve();
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
    async loginWithFacebook(options) {
        if (!this.facebookAppId) {
            throw new Error('Facebook App ID not set. Call initialize() first.');
        }
        return new Promise((resolve, reject) => {
            FB.login((response) => {
                if (response.status === 'connected') {
                    FB.api('/me', { fields: 'id,name,email,picture' }, (userInfo) => {
                        var _a, _b;
                        const result = {
                            accessToken: {
                                token: response.authResponse.accessToken,
                                userId: response.authResponse.userID,
                            },
                            profile: {
                                userID: userInfo.id,
                                name: userInfo.name,
                                email: userInfo.email || null,
                                imageURL: ((_b = (_a = userInfo.picture) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.url) || null,
                                friendIDs: [],
                                birthday: null,
                                ageRange: null,
                                gender: null,
                                location: null,
                                hometown: null,
                                profileURL: null,
                            },
                            idToken: null,
                        };
                        resolve({ provider: 'facebook', result });
                    });
                }
                else {
                    reject(new Error('Facebook login failed'));
                }
            }, { scope: options.permissions.join(',') });
        });
    }
    fallbackToTraditionalOAuth() {
        const params = new URLSearchParams({
            client_id: this.googleClientId,
            redirect_uri: window.location.href,
            response_type: this.googleLoginType === 'offline' ? 'code' : 'token id_token',
            scope: 'openid',
            nonce: Math.random().toString(36).substring(2),
            include_granted_scopes: 'true',
        });
        const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        localStorage.setItem(SocialLoginWeb.OAUTH_STATE_KEY, 'true');
        window.location.href = url;
    }
}
SocialLoginWeb.OAUTH_STATE_KEY = 'social_login_oauth_pending';
//# sourceMappingURL=web.js.map