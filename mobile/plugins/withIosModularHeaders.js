const { createRunOncePlugin, withPodfile } = require('@expo/config-plugins');

const pkg = require('../package.json');

const withIosModularHeaders = (config) =>
    withPodfile(config, (config) => {
        const podfile = config.modResults.contents;

        let updatedPodfile = podfile;
        if (!/^\s*use_modular_headers!\s*$/m.test(updatedPodfile)) {
            const platformDeclaration = /^platform :ios,.*$/m;
            if (!platformDeclaration.test(updatedPodfile)) {
                throw new Error('Could not find the iOS platform declaration in the Podfile.');
            }

            updatedPodfile = updatedPodfile.replace(platformDeclaration, '$&\n\nuse_modular_headers!');
        }

        const buildConfigurationLoop = /(\s+target\.build_configurations\.each do \|config\|\n)/;
        if (!buildConfigurationLoop.test(updatedPodfile)) {
            throw new Error('Could not find the Podfile post-install build configuration loop.');
        }

        updatedPodfile = updatedPodfile.replace(
            buildConfigurationLoop,
            '$1        config.build_settings[\'IPHONEOS_DEPLOYMENT_TARGET\'] = \'15.1\'\n',
        );
        config.modResults.contents = updatedPodfile;
        return config;
    });

module.exports = createRunOncePlugin(withIosModularHeaders, 'withIosModularHeaders', pkg.version);
