const { createRunOncePlugin, withProjectBuildGradle, withAppBuildGradle } = require('@expo/config-plugins');

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

  return config;
};

function addMavenRepository(buildGradle) {
  if (buildGradle.includes('maven.pkg.github.com/facebook/meta-wearables-sdk')) {
    return buildGradle;
  }

  const mavenBlock = `
        maven {
            url = uri("https://maven.pkg.github.com/facebook/meta-wearables-sdk")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: "YOUR_USERNAME"
                password = System.getenv("GITHUB_TOKEN") ?: "YOUR_TOKEN"
            }
        }`;

  // Basic insertion finding the repositories block inside allprojects
  if (buildGradle.includes('allprojects')) {
      // Find the repositories block within allprojects
      // This is a naive replacement, but sufficient for standard expo templates
      return buildGradle.replace(/allprojects\s*{[\s\S]*?repositories\s*{/, match => `${match}${mavenBlock}\n`);
  }
  
  // Fallback if allprojects structure is weird, just add to the first repositories block found
  return buildGradle.replace(/repositories\s*{/, `repositories {${mavenBlock}\n`);
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
