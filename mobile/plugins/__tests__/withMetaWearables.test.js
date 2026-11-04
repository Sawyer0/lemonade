/**
 * @jest-environment node
 */
const withMetaWearables = require('../withMetaWearables');

jest.mock('@expo/config-plugins', () => ({
    withAndroidManifest: jest.fn((config, action) => {
        return { ...config, _androidManifestAction: action };
    }),
    withDangerousMod: jest.fn((config, [, action]) => {
        return { ...config, _dangerousModAction: action };
    }),
    createRunOncePlugin: jest.fn((plugin) => plugin),
}));

const { withAndroidManifest } = require('@expo/config-plugins');

describe('withMetaWearables manifest', () => {
    it('should apply android manifest mod', () => {
        const config = { name: 'test-app', slug: 'test-app' };
        withMetaWearables(config);
        expect(withAndroidManifest).toHaveBeenCalled();
    });

    it('should inject permissions and meta-data into manifest', () => {
        const config = { name: 'test-app', slug: 'test-app' };
        const resultConfig = withMetaWearables(config);
        const action = resultConfig._androidManifestAction;

        const initialModConfig = {
            modResults: {
                manifest: {
                    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
                    application: [
                        {
                            $: { 'android:name': '.MainApplication' },
                            activity: [{ $: { 'android:name': '.MainActivity' } }],
                        },
                    ],
                },
            },
        };

        const finalModConfig = action(initialModConfig);
        const manifest = finalModConfig.modResults;
        const application = manifest.manifest.application[0];

        // Check meta-data
        const metaData = Object.fromEntries(
            application['meta-data'].map((m) => [m.$['android:name'], m.$['android:value']]),
        );
        expect(metaData).toEqual({
            'com.meta.wearable.mwdat.APPLICATION_ID': '0',
            'com.meta.wearable.mwdat.CLIENT_TOKEN': '0',
        });

        // Check permissions
        const permissions = manifest.manifest['uses-permission'].map((p) => p.$['android:name']);
        expect(permissions).toContain('android.permission.BLUETOOTH');
        expect(permissions).toContain('android.permission.BLUETOOTH_CONNECT');
        expect(permissions).toContain('android.permission.INTERNET');

        // Check queries
        expect(manifest.manifest.queries).toBeDefined();
        expect(manifest.manifest.queries[0].package).toBeDefined();
        expect(manifest.manifest.queries[0].package.some((p) => p.$['android:name'] === 'com.facebook.stella')).toBe(
            true,
        );

        // Check intent-filter
        const mainActivity = application.activity.find((a) => a.$['android:name'] === '.MainActivity');
        const intentFilter = mainActivity['intent-filter'].find(
            (f) => f.data && f.data.some((d) => d.$['android:scheme'] === 'lemonade-meta'),
        );
        expect(intentFilter).toBeDefined();
    });

    it('should inject FileProvider into manifest', () => {
        const config = { name: 'test-app', slug: 'test-app' };
        const resultConfig = withMetaWearables(config);
        const action = resultConfig._androidManifestAction;

        const initialModConfig = {
            modResults: {
                manifest: {
                    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android', package: 'com.lemonade.app' },
                    application: [
                        {
                            $: { 'android:name': '.MainApplication' },
                        },
                    ],
                },
            },
        };

        const finalModConfig = action(initialModConfig);
        const application = finalModConfig.modResults.manifest.application[0];

        const provider = application.provider.find((p) => p.$['android:name'] === 'androidx.core.content.FileProvider');
        expect(provider).toBeDefined();
        expect(provider.$['android:authorities']).toBe('com.lemonade.app.fileprovider');
        expect(provider.$['android:exported']).toBe('false');
        expect(provider.$['android:grantUriPermissions']).toBe('true');
        expect(provider['meta-data'][0].$['android:name']).toBe('android.support.FILE_PROVIDER_PATHS');
        expect(provider['meta-data'][0].$['android:resource']).toBe('@xml/file_paths');
    });
});
