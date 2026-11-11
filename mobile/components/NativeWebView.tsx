import React, { useRef, useEffect, useState } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, StatusBar, View, ActivityIndicator, BackHandler, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useKeepAwake } from 'expo-keep-awake';
import { useNativeAuth } from '../hooks/useNativeAuth';
import { useWebViewBridge } from '../hooks/useWebViewBridge';
import { CONFIG } from '@mobile/constants/config';
import { GlassCard } from './ui/GlassCard';
import { useRouter } from 'expo-router';
import { LucideGlasses } from 'lucide-react-native';

import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { VinScanner } from './VinScanner';

interface NativeWebViewProps {
    route?: string;
}

export default function NativeWebView({ route = '/' }: NativeWebViewProps) {
    const webviewRef = useRef<WebView>(null);
    const router = useRouter();
    useKeepAwake(); // Prevents screen from sleeping during video diagnostics
    const { isSigningIn, signIn, signOut, idToken } = useNativeAuth();
    const { injectedJavaScript } = useWebViewBridge(idToken);
    const insets = useSafeAreaInsets();

    // Permission Hooks
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    // Web Login State
    const [isWebLoggedIn, setIsWebLoggedIn] = useState(false);

    // Scanner State
    const [showScanner, setShowScanner] = useState(false);

    // Request Permissions on Mount
    useEffect(() => {
        if (!cameraPermission?.granted) requestCameraPermission();
        if (!micPermission?.granted) requestMicPermission();
    }, [cameraPermission?.granted, micPermission?.granted, requestCameraPermission, requestMicPermission]);

    // Handle Android Back Button
    useEffect(() => {
        const onBackPress = () => {
            if (showScanner) {
                setShowScanner(false);
                return true;
            }
            if (webviewRef.current) {
                webviewRef.current.goBack();
                return true; // Prevent default behavior (exit app)
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, [showScanner]);

    // Combine Hiding Script + Auth Bridge Script + Safe Area Injection
    const hideButtonScript = `
        (function() {
            try {
                const style = document.createElement('style');
                style.textContent = '.google-sign-in-native-hide { display: none !important; }';
                document.head.appendChild(style);
            } catch (e) { console.error('Style injection failed', e); }
        })();
    `;

    const safeAreaScript = `
        document.documentElement.style.setProperty('--safe-top', '${insets.top}px');
        document.documentElement.style.setProperty('--safe-bottom', '${insets.bottom}px');
        document.documentElement.style.setProperty('--safe-left', '${insets.left}px');
        document.documentElement.style.setProperty('--safe-right', '${insets.right}px');
    `;

    const combinedInjection = `${hideButtonScript}\n${safeAreaScript}\n${injectedJavaScript}\ntrue;`;

    // Inject JS when token changes or WebView loads
    useEffect(() => {
        if (idToken && webviewRef.current) {
            const script = CONFIG.SCRIPTS.INJECT_TOKEN(idToken);
            webviewRef.current.injectJavaScript(script);
        }
    }, [idToken]);

    const fullUri = `${CONFIG.API.BASE_URL}${route}`;

    // Memoize the source object to prevent WebView reloads on every render
    const webViewSource = React.useMemo(
        () => ({
            uri: fullUri,
            headers: {
                'Bypass-Tunnel-Reminder': 'true',
                'User-Agent': CONFIG.API.USER_AGENT,
            },
        }),
        [fullUri],
    );

    const handleVinScanned = (vin: string) => {
        if (webviewRef.current) {
            const script = `
                window.postMessage(JSON.stringify({ type: 'VIN_SCANNED', vin: '${vin}' }), '*');
                true; // required for iOS
            `;
            webviewRef.current.injectJavaScript(script);
        }
        setShowScanner(false);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="dark-content" />
            <WebView
                ref={webviewRef}
                source={webViewSource}
                style={[styles.webview, { backgroundColor: 'transparent' }]}
                bounces={false}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                javaScriptEnabled={true}
                scrollEnabled={true}
                scalesPageToFit={true}
                startInLoadingState={true}
                renderLoading={() => (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#007AFF" />
                    </View>
                )}
                injectedJavaScript={combinedInjection}
                domStorageEnabled={true}
                allowFileAccess={true}
                allowUniversalAccessFromFileURLs={true}
                allowsInlineMediaPlayback={true}
                mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
                allowsBackForwardNavigationGestures={true}
                onMessage={(event) => {
                    try {
                        const data = JSON.parse(event.nativeEvent.data);
                        if (data.type === 'SIGN_OUT') {
                            signOut();
                            setIsWebLoggedIn(false);
                        } else if (data.type === 'LOGIN_SUCCESS') {
                            setIsWebLoggedIn(true);
                        } else if (data.type === 'SCAN_VIN') {
                            if (cameraPermission?.granted) {
                                setShowScanner(true);
                            } else {
                                requestCameraPermission().then((res) => {
                                    if (res.granted) setShowScanner(true);
                                    else alert('Camera permission needed to scan VIN');
                                });
                            }
                        }
                    } catch {
                        // Non-JSON message or irrelevant
                    }
                }}
            />

            {/* Auth Overlay */}
            {!idToken && !isWebLoggedIn && !showScanner && (
                <View style={styles.authOverlay}>
                    <GlassCard>
                        <GoogleSigninButton
                            size={GoogleSigninButton.Size.Wide}
                            color={GoogleSigninButton.Color.Light}
                            onPress={signIn}
                            disabled={isSigningIn}
                        />
                    </GlassCard>
                </View>
            )}

            {/* Application Modals */}
            {showScanner && (
                <View style={StyleSheet.absoluteFill}>
                    <VinScanner onScan={handleVinScanned} onClose={() => setShowScanner(false)} />
                </View>
            )}

            {/* Floating Glasses Action */}
            {idToken && !showScanner && (
                <TouchableOpacity
                    style={[styles.glassesButton, { top: insets.top + 10 }]}
                    onPress={() => router.push('/connect-glasses')}
                >
                    <LucideGlasses color="#fff" size={24} />
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    webview: {
        flex: 1,
    },

    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center', // Center content
        backgroundColor: 'white',
    },
    authOverlay: {
        position: 'absolute',
        bottom: 50, // Move up from bottom
        left: 20,
        right: 20,
        alignItems: 'center',
        zIndex: 100,
    },
    glassesButton: {
        position: 'absolute',
        right: 20,
        backgroundColor: 'rgba(0, 122, 255, 0.9)',
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        zIndex: 1000,
    },
});
