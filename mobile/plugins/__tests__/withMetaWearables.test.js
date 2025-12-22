/**
 * @jest-environment node
 */
const withMetaWearables = require('../withMetaWearables');
const { withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');

jest.mock('@expo/config-plugins', () => ({
  withProjectBuildGradle: jest.fn((config, action) => {
    return { ...config, _projectBuildGradleAction: action };
  }),
  withAppBuildGradle: jest.fn((config, action) => {
     return { ...config, _appBuildGradleAction: action };
  }),
  createRunOncePlugin: jest.fn((plugin, name, version) => plugin),
}));

describe('withMetaWearables', () => {
  it('should apply project build gradle mod', () => {
    const config = { name: 'test-app', slug: 'test-app' };
    withMetaWearables(config);
    expect(withProjectBuildGradle).toHaveBeenCalled();
  });

  it('should add maven repository to project build gradle', () => {
    const config = { name: 'test-app', slug: 'test-app' };
    const resultConfig = withMetaWearables(config);
    const action = resultConfig._projectBuildGradleAction;
    const initialModConfig = { 
        modResults: { contents: 'allprojects {\n    repositories {\n        google()\n        jcenter()\n    }\n}', language: 'groovy' } 
    };
    const finalModConfig = action(initialModConfig);
    expect(finalModConfig.modResults.contents).toContain('maven.pkg.github.com/facebook/meta-wearables-sdk');
    expect(finalModConfig.modResults.contents).toContain('GITHUB_TOKEN');
  });

  it('should apply app build gradle mod', () => {
    const config = { name: 'test-app', slug: 'test-app' };
    withMetaWearables(config);
    expect(withAppBuildGradle).toHaveBeenCalled();
  });

  it('should add dependencies to app build gradle', () => {
    const config = { name: 'test-app', slug: 'test-app' };
    const resultConfig = withMetaWearables(config);
    const action = resultConfig._appBuildGradleAction;
    const initialModConfig = { 
        modResults: { contents: 'dependencies {\n    implementation "test"\n}', language: 'groovy' } 
    };
    const finalModConfig = action(initialModConfig);
    expect(finalModConfig.modResults.contents).toContain('com.meta.wearables:mwdat-core');
    expect(finalModConfig.modResults.contents).toContain('com.meta.wearables:mwdat-camera');
    expect(finalModConfig.modResults.contents).toContain('mwdat-mockdevice');
  });
});
