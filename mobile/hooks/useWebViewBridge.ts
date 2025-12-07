import { useMemo } from 'react';
import { CONFIG } from '../core/config';

export function useWebViewBridge(idToken: string | null) {
    const injectedJavaScript = useMemo(() => {
        let script = CONFIG.SCRIPTS.AUTO_CLICK_CONTINUE;

        if (idToken) {
            script += CONFIG.SCRIPTS.INJECT_TOKEN(idToken);
        }

        return script;
    }, [idToken]);

    return { injectedJavaScript };
}
