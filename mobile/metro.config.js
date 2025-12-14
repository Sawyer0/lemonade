/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Watch the root of the monorepo/workspace to allow importing from ../src
config.watchFolders = [path.resolve(__dirname, '..')];

config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../node_modules'),
];

module.exports = config;
