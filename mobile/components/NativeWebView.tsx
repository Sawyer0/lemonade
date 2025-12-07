import React, { useRef, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { StyleSheet, StatusBar, View, ActivityIndicator, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useKeepAwake } from 'expo-keep-awake';
import { useNativeAuth } from '../hooks/useNativeAuth';
import { useWebViewBridge } from '../hooks/useWebViewBridge';
import { CONFIG } from '../core/config';

interface NativeWebViewProps {
    route?: string;
}

export default function NativeWebView({ route = '/' }: NativeWebViewProps) {
    const webviewRef = useRef<WebView>(null);
    useKeepAwake(); // Prevents screen from sleeping during video diagnostics
    const { isSigningIn, signIn, signOut, idToken } = useNativeAuth();
    const { injectedJavaScript } = useWebViewBridge(idToken);

    // Handle Android Back Button
    useEffect(() => {
        const onBackPress = () => {
            if (webviewRef.current) {
                webviewRef.current.goBack();
                return true; // Prevent default behavior (exit app)
            }
            return false;
        };

        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
    }, []);

    // Combine Hiding Script + Auth Bridge Script
    const hideButtonScript = `
        (function() {
            try {
                const style = document.createElement('style');
                style.textContent = '.google-sign-in-native-hide { display: none !important; }';
                document.head.appendChild(style);
            } catch (e) { console.error('Style injection failed', e); }
        })();
        true;
    `;

    const combinedInjection = `${hideButtonScript}\n${injectedJavaScript}`;

    // Inject JS when token changes or WebView loads
    useEffect(() => {
        if (idToken && webviewRef.current) {
            const script = CONFIG.SCRIPTS.INJECT_TOKEN(idToken);
            webviewRef.current.injectJavaScript(script);
        }
    }, [idToken]);

    const fullUri = `${CONFIG.API.BASE_URL}${route}`;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="dark-content" />
            <WebView
                ref={webviewRef}
                source={{
                    uri: fullUri,
                    headers: {
                        'Bypass-Tunnel-Reminder': 'true',
                        'User-Agent': CONFIG.API.USER_AGENT
                    }
                }}
                style={styles.webview}
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
                            // Standard Logging
                            // console.log("Received Web Sign Out Request");
                            signOut();
                        }
                    } catch (e) {
                        // Non-JSON message or irrelevant
                    }
                }}
            />

            <View style={styles.authBar}>
                {!idToken && (
                    <GoogleSigninButton
                        size={GoogleSigninButton.Size.Wide}
                        color={GoogleSigninButton.Color.Light}
                        onPress={signIn}
                        disabled={isSigningIn}
                    />
                )}
            </View>
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
    authBar: {
        padding: 5,
        backgroundColor: '#f0f0f0',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#ccc',
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white'
    },
    signOutContainer: {
        width: '100%',
        alignItems: 'center',
    }
});
