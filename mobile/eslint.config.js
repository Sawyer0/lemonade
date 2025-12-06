// https://docs.expo.dev/guides/using-eslint/
/* eslint-disable @typescript-eslint/no-require-imports */
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
]);
