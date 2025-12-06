import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
    // Check if we are running in web mode via explicit Env Var
    // (process.argv is unreliable in some CLI contexts)
    const isWeb = process.env.EXPO_PUBLIC_PLATFORM === 'web';

    let plugins = config.plugins || [];

    if (isWeb) {
        // Filter out plugins that are known to cause issues on web or are native-only
        plugins = plugins.filter(plugin => {
            const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
            return pluginName !== '@livekit/react-native';
        });
    }

    return {
        ...config,
        name: config.name ?? "mobile",
        slug: config.slug ?? "mobile",
        plugins,
    };
};
