import { ExpoConfig, ConfigContext } from 'expo/config';

const appConfig = ({ config }: ConfigContext): ExpoConfig => {
    // Check if we are running in web mode via explicit Env Var
    // (process.argv is unreliable in some CLI contexts)
    const isWeb = process.env.EXPO_PUBLIC_PLATFORM === 'web';
    const disableAI = process.env.DISABLE_LOCAL_AI === 'true';

    let plugins = config.plugins || [];

    if (isWeb || disableAI) {
        // Filter out plugins that are known to cause issues on web or are native-only
        const nativeOnlyPlugins = [
            '@livekit/react-native',
            'react-native-vision-camera',
            'llama.rn'
        ];
        plugins = plugins.filter(plugin => {
            const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
            return !nativeOnlyPlugins.includes(pluginName);
        });
    }

    return {
        ...config,
        name: config.name ?? "mobile",
        slug: config.slug ?? "mobile",
        plugins,
    };
};

export default appConfig;
