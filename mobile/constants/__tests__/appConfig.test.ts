import { BRAND_TOKENS } from '@lemonade/core';
import appConfig from '../../app.json';

/**
 * app.json cannot import the brand tokens, so its brand colors are
 * hardcoded copies. This test pins the Android adaptive icon background
 * to the light background token, so a token change surfaces here instead
 * of the icon silently drifting from the app.
 */
describe('app.json', () => {
    it('uses the light background token for the Android adaptive icon', () => {
        expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe(BRAND_TOKENS.light.background);
    });
});
