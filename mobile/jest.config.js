module.exports = {
    preset: 'jest-expo',
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(modules-core)?|@expo(nent)?|.*react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|llama.rn|@lemonade/core|react-native-vision-camera|vision-camera-resize-plugin|react-native-reanimated|react-native-worklets-core)'
    ],
    moduleNameMapper: {
        '.*expo/src/winter/runtime.native.ts': '<rootDir>/__mocks__/expo-winter-stub.js',
        '.*expo/src/winter/installGlobal.ts': '<rootDir>/__mocks__/expo-winter-stub.js',
        // Try strict relative path if regex fails
        '<rootDir>/../node_modules/expo/src/winter/runtime.native.ts': '<rootDir>/__mocks__/expo-winter-stub.js',
    },
    moduleDirectories: ['node_modules', '../node_modules'],
    setupFilesAfterEnv: ['./jest.setup.js'],
};
