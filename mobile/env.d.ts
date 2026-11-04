declare module '@env' {
    export const API_BASE: string;
    export const EXPO_PUBLIC_API_URL: string;
    export const EXPO_PUBLIC_LIVEKIT_URL: string;
}

/** Metro resolves bundled audio to an asset id. */
declare module '*.mp3' {
    const assetId: number;
    export default assetId;
}
