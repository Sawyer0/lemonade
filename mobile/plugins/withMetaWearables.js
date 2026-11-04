const { createRunOncePlugin, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');

/**
 * Android setup for the Meta Wearables Device Access Toolkit. The SDK itself is
 * a Maven Central dependency of the local meta-wearables module; this plugin
 * adds what has to live in the app manifest: attestation metadata (0/0 in
 * Developer Mode), the Meta AI app query and the registration callback scheme.
 * https://wearables.developer.meta.com/docs/develop/dat/build-integration-android
 */
const withMetaWearables = (config) => {
    config = withAndroidManifest(config, (config) => {
        config.modResults = addPermissions(config.modResults);
        config.modResults = addMetaData(config.modResults);
        config.modResults = addQueries(config.modResults);
        config.modResults = addIntentFilter(config.modResults);
        config.modResults = addFileProvider(config.modResults);
        return config;
    });

    config = withDangerousMod(config, [
        'android',
        async (config) => {
            await createFilePathResource(config.modRequest.projectRoot);
            return config;
        },
    ]);

    return config;
};

function addPermissions(manifest) {
    const permissions = [
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.INTERNET',
    ];

    if (!manifest.manifest['uses-permission']) {
        manifest.manifest['uses-permission'] = [];
    }

    permissions.forEach((permission) => {
        if (!manifest.manifest['uses-permission'].some((p) => p.$['android:name'] === permission)) {
            manifest.manifest['uses-permission'].push({ $: { 'android:name': permission } });
        }
    });

    return manifest;
}

function addMetaData(manifest) {
    const application = manifest.manifest.application[0];
    const entries = {
        'com.meta.wearable.mwdat.APPLICATION_ID': process.env.META_WEARABLES_APPLICATION_ID || '0',
        'com.meta.wearable.mwdat.CLIENT_TOKEN': process.env.META_WEARABLES_CLIENT_TOKEN || '0',
    };

    if (!application['meta-data']) {
        application['meta-data'] = [];
    }

    for (const [name, value] of Object.entries(entries)) {
        if (!application['meta-data'].some((m) => m.$['android:name'] === name)) {
            application['meta-data'].push({ $: { 'android:name': name, 'android:value': value } });
        }
    }

    return manifest;
}

function addQueries(manifest) {
    if (!manifest.manifest.queries) {
        manifest.manifest.queries = [];
    }

    const queries = manifest.manifest.queries[0] || {};
    if (!queries.package) {
        queries.package = [];
    }

    const stellaPackage = 'com.facebook.stella';
    if (!queries.package.some((p) => p.$['android:name'] === stellaPackage)) {
        queries.package.push({ $: { 'android:name': stellaPackage } });
    }

    if (!manifest.manifest.queries[0]) {
        manifest.manifest.queries[0] = queries;
    }

    return manifest;
}

function addIntentFilter(manifest) {
    const application = manifest.manifest.application[0];
    if (!application.activity) return manifest;

    const mainActivity = application.activity.find((a) => a.$['android:name'] === '.MainActivity');

    if (!mainActivity) return manifest;

    if (!mainActivity['intent-filter']) {
        mainActivity['intent-filter'] = [];
    }

    const scheme = 'lemonade-meta';
    const hasIntentFilter = mainActivity['intent-filter'].some(
        (filter) => filter.data && filter.data.some((d) => d.$['android:scheme'] === scheme),
    );

    if (!hasIntentFilter) {
        mainActivity['intent-filter'].push({
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [
                { $: { 'android:name': 'android.intent.category.DEFAULT' } },
                { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
            ],
            data: [{ $: { 'android:scheme': scheme } }],
        });
    }

    return manifest;
}

function addFileProvider(manifest) {
    const application = manifest.manifest.application[0];
    if (!application.provider) {
        application.provider = [];
    }

    const packageName = manifest.manifest.$.package || 'com.lemonade.app';
    const authority = `${packageName}.fileprovider`;

    if (!application.provider.some((p) => p.$['android:name'] === 'androidx.core.content.FileProvider')) {
        application.provider.push({
            $: {
                'android:name': 'androidx.core.content.FileProvider',
                'android:authorities': authority,
                'android:exported': 'false',
                'android:grantUriPermissions': 'true',
            },
            'meta-data': [
                {
                    $: {
                        'android:name': 'android.support.FILE_PROVIDER_PATHS',
                        'android:resource': '@xml/file_paths',
                    },
                },
            ],
        });
    }

    return manifest;
}

async function createFilePathResource(projectRoot) {
    const resDir = path.join(projectRoot, 'android/app/src/main/res/xml');
    if (!fs.existsSync(resDir)) {
        fs.mkdirSync(resDir, { recursive: true });
    }

    const filePathsContent = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="Android/data/${path.basename(projectRoot)}/files/Pictures" />
    <cache-path name="cache_images" path="." />
</paths>`;

    fs.writeFileSync(path.join(resDir, 'file_paths.xml'), filePathsContent);
}

module.exports = createRunOncePlugin(withMetaWearables, 'withMetaWearables', pkg.version);
