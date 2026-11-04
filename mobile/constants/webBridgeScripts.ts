/**
 * JavaScript injected into the Next.js app running inside NativeWebView.
 * The web side registers window.handleNativeGoogleLogin(idToken) in its
 * AuthProvider (src/presentation/context/AuthContext.tsx).
 */

/** Hosts of the dev tunnels used to reach a local server from a phone. */
const TUNNEL_HOST_SUFFIXES = ['loca.lt', 'lhr.life'];

/**
 * Hands the native Google ID token to the web app. The web AuthProvider may
 * not have mounted yet, so retry for up to ~10 s before giving up.
 */
export function injectGoogleTokenScript(idToken: string): string {
    return `
(function () {
    var token = ${JSON.stringify(idToken)};
    var attempts = 0;
    function deliver() {
        if (typeof window.handleNativeGoogleLogin === 'function') {
            window.handleNativeGoogleLogin(token);
            return;
        }
        if (++attempts < 50) setTimeout(deliver, 200);
    }
    deliver();
})();
true;`;
}

/** Clicks through the tunnel provider's interstitial page, if one is showing. */
export const AUTO_CLICK_CONTINUE_SCRIPT = `
(function () {
    var suffixes = ${JSON.stringify(TUNNEL_HOST_SUFFIXES)};
    var host = window.location.hostname;
    if (!suffixes.some(function (s) { return host === s || host.endsWith('.' + s); })) return;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button, input[type="submit"], a'));
    var next = buttons.find(function (b) { return /continue/i.test(b.textContent || b.value || ''); });
    if (next) next.click();
})();
true;`;

/** Identifies WebView traffic to the server and skips tunnel interstitials. */
export const WEBVIEW_USER_AGENT = 'LemonadeMobile/1.0 (ReactNativeWebView)';
