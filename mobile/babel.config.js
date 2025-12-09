module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            [
                'module-resolver',
                {
                    root: ['./'],
                    alias: {
                        '@mobile': './',
                        '@core': '../src/core',
                        '@infrastructure': '../src/infrastructure',
                        '@web-shared-hooks': '../src/presentation/hooks',
            '@': '../src'
                    },
                    extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json']
                }
            ],
            'react-native-reanimated/plugin'
        ]
    };
};
