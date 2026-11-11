const path = require('path');

module.exports = {
    preset: 'jest-expo',
    rootDir: path.resolve(__dirname),
    roots: [
        path.resolve(__dirname),
        path.resolve(__dirname, '../'), // Go up to project root (lemonade-mvp) to capture hoisted node_modules
    ],
    testMatch: ['<rootDir>/**/__tests__/**/*.[jt]s?(x)', '<rootDir>/**/?(*.)+(spec|test).[jt]s?(x)'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(modules-core)?|@expo(nent)?|.*react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|llama.rn|@lemonade/core|react-native-vision-camera|vision-camera-resize-plugin|react-native-reanimated|react-native-worklets-core|firebase|@firebase|react-native-paper|react-native-vector-icons)',
    ],
    moduleNameMapper: {
        '^@mobile/(.*)$': '<rootDir>/$1',
        '^@lemonade/core$': '<rootDir>/../packages/core/src/index.ts',
        '^@lemonade/infrastructure$': '<rootDir>/../packages/infrastructure/src/index.ts',
        '^expo$': '<rootDir>/__mocks__/expo.js',
        'expo/src/winter/runtime\\.native\\.ts': '<rootDir>/__mocks__/expo-winter-stub.js',
        'expo/src/winter/installGlobal\\.ts': '<rootDir>/__mocks__/expo-winter-stub.js',
    },
    moduleDirectories: ['node_modules', '../node_modules'],
    modulePathIgnorePatterns: ['<rootDir>/../.next'],
    setupFilesAfterEnv: ['./jest.setup.js'],
    watchman: false,
};
