module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Note: module-resolver temporarily disabled for debugging expo-router
            'react-native-reanimated/plugin'
        ]
    };
};
