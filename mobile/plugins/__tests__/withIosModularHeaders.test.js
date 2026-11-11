/**
 * @jest-environment node
 */
const withIosModularHeaders = require('../withIosModularHeaders');

jest.mock('@expo/config-plugins', () => ({
    withPodfile: jest.fn((config, action) => ({ ...config, _podfileAction: action })),
    createRunOncePlugin: jest.fn((plugin) => plugin),
}));

describe('withIosModularHeaders', () => {
    const makeConfig = (contents) => {
        const config = withIosModularHeaders({});
        return config._podfileAction({ modResults: { contents } });
    };

    it('adds modular headers to the generated Podfile', () => {
        const result = makeConfig(
            "platform :ios, '15.1'\n\ntarget 'App' do\n" +
                "  post_install do |installer|\n" +
                "    installer.pods_project.targets.each do |target|\n" +
                "      target.build_configurations.each do |config|\n" +
                "      end\n" +
                "    end\n" +
                "  end\n" +
                "end\n",
        );

        expect(result.modResults.contents).toContain("platform :ios, '15.1'\n\nuse_modular_headers!");
        expect(result.modResults.contents).toContain(
            "target.build_configurations.each do |config|\n        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'",
        );
    });

    it('does not add the directive more than once', () => {
        const podfile =
            "platform :ios, '15.1'\nuse_modular_headers!\n" +
            "post_install do |installer|\n" +
            "  installer.pods_project.targets.each do |target|\n" +
            "    target.build_configurations.each do |config|\n" +
            "    end\n" +
            "  end\n" +
            "end\n";

        const result = makeConfig(podfile);
        expect(result.modResults.contents).toContain("use_modular_headers!\n");
        expect(result.modResults.contents).toContain("IPHONEOS_DEPLOYMENT_TARGET");
    });

    it('reports an unexpected Podfile format', () => {
        expect(() => makeConfig("target 'App' do\nend\n")).toThrow(
            'Could not find the iOS platform declaration in the Podfile.',
        );
    });
});
