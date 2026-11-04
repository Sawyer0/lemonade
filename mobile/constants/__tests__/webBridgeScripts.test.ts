import { AUTO_CLICK_CONTINUE_SCRIPT, injectGoogleTokenScript } from '../webBridgeScripts';

type FakeWindow = {
    handleNativeGoogleLogin?: (token: string) => void;
    location: { hostname: string };
};

function run(script: string, win: FakeWindow, doc: unknown = {}) {
    // Scripts run in the WebView page; evaluate them against a fake window/document.
    new Function('window', 'document', 'setTimeout', script)(win, doc, (fn: () => void) => fn());
}

describe('injectGoogleTokenScript', () => {
    it('passes the token to the web bridge handler', () => {
        const handler = jest.fn();
        run(injectGoogleTokenScript('id-token-123'), { handleNativeGoogleLogin: handler, location: { hostname: 'x' } });
        expect(handler).toHaveBeenCalledWith('id-token-123');
    });

    it('escapes the token so it cannot break out of the script', () => {
        const handler = jest.fn();
        const nasty = "abc'); alert(1); ('";
        run(injectGoogleTokenScript(nasty), { handleNativeGoogleLogin: handler, location: { hostname: 'x' } });
        expect(handler).toHaveBeenCalledWith(nasty);
    });

    it('retries until the handler is registered', () => {
        const win: FakeWindow = { location: { hostname: 'x' } };
        const handler = jest.fn();
        let calls = 0;
        new Function('window', 'document', 'setTimeout', injectGoogleTokenScript('t'))(win, {}, (fn: () => void) => {
            if (++calls === 3) win.handleNativeGoogleLogin = handler;
            fn();
        });
        expect(handler).toHaveBeenCalledWith('t');
    });
});

describe('AUTO_CLICK_CONTINUE_SCRIPT', () => {
    const makeDoc = (click: jest.Mock) => ({
        querySelectorAll: () => [{ textContent: 'Click to Continue', click }],
    });

    it('clicks the continue button on a tunnel host', () => {
        const click = jest.fn();
        run(AUTO_CLICK_CONTINUE_SCRIPT, { location: { hostname: 'abc.loca.lt' } }, makeDoc(click));
        expect(click).toHaveBeenCalled();
    });

    it('does nothing on the real app host', () => {
        const click = jest.fn();
        run(AUTO_CLICK_CONTINUE_SCRIPT, { location: { hostname: 'app.example.com' } }, makeDoc(click));
        expect(click).not.toHaveBeenCalled();
    });
});
