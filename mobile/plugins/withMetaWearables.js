const {
    createRunOncePlugin,
    withProjectBuildGradle,
    withAppBuildGradle,
    withAndroidManifest,
    withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');

const withMetaWearables = (config) => {
    config = withProjectBuildGradle(config, (config) => {
        if (config.modResults.language === 'groovy') {
            config.modResults.contents = addMavenRepository(config.modResults.contents);
        }
        return config;
    });

    config = withAppBuildGradle(config, (config) => {
        if (config.modResults.language === 'groovy') {
            config.modResults.contents = addDependencies(config.modResults.contents);
        }
        return config;
    });

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
    const applicationId = process.env.META_WEARABLES_APPLICATION_ID || '0';
    const application = manifest.manifest.application[0];

    if (!application['meta-data']) {
        application['meta-data'] = [];
    }

    if (!application['meta-data'].some((m) => m.$['android:name'] === 'com.meta.wearables.APPLICATION_ID')) {
        application['meta-data'].push({
            $: {
                'android:name': 'com.meta.wearables.APPLICATION_ID',
                'android:value': applicationId,
            },
        });
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

function addMavenRepository(buildGradle) {
    if (buildGradle.includes('maven.pkg.github.com/facebook/meta-wearables-sdk')) {
        return buildGradle;
    }

    // Use Gradle properties or Env vars directly in the gradle file
    const mavenBlock = `
        maven {
            url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: project.findProperty("GITHUB_ACTOR")
                password = System.getenv("GITHUB_TOKEN") ?: project.findProperty("GITHUB_TOKEN")
            }
        }`;

    // Robust insertion into 'allprojects > repositories' or root 'repositories'
    if (buildGradle.includes('allprojects {')) {
        const regex = /(allprojects\s*{[\s\S]*?repositories\s*{)/;
        if (regex.test(buildGradle)) {
            return buildGradle.replace(regex, `$1\n${mavenBlock}`);
        }
    }

    // Fallback to first repositories block
    return buildGradle.replace(/repositories\s*{/, `repositories {\n${mavenBlock}`);
}

function addDependencies(appBuildGradle) {
    if (appBuildGradle.includes('com.meta.wearables:mwdat-core')) {
        return appBuildGradle;
    }

    const dependencies = `
    implementation("com.meta.wearables:mwdat-core:1.0.0")
    implementation("com.meta.wearables:mwdat-camera:1.0.0")
    if (project.hasProperty("useMockDevice")) {
        implementation("com.meta.wearables:mwdat-mockdevice:1.0.0")
    }
  `;

    return appBuildGradle.replace(/dependencies\s*{/, `dependencies {${dependencies}\n`);
}

module.exports = createRunOncePlugin(withMetaWearables, 'withMetaWearables', pkg.version);
