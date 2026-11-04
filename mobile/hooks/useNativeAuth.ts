import { useState, useEffect } from 'react';
import { GoogleSignin, statusCodes, SignInResponse } from '@react-native-google-signin/google-signin';
import { CONFIG } from '@mobile/constants/config';

export interface UseNativeAuthResult {
    userInfo: SignInResponse | null;
    isSigningIn: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    idToken: string | null;
}

export function useNativeAuth(): UseNativeAuthResult {
    const [userInfo, setUserInfo] = useState<SignInResponse | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: CONFIG.AUTH.GOOGLE_WEB_CLIENT_ID,
            offlineAccess: true,
        });
    }, []);

    const signIn = async () => {
        try {
            setIsSigningIn(true);
            await GoogleSignin.hasPlayServices();
            const response = await GoogleSignin.signIn();
            setUserInfo(response);
        } catch (error) {
            const err = error as { code: string };
            if (err.code === statusCodes.SIGN_IN_CANCELLED) {
                // user cancelled the login flow
            } else if (err.code === statusCodes.IN_PROGRESS) {
                // operation (e.g. sign in) is in progress already
            } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                // play services not available or outdated
            } else {
                console.error('Google Sign-In Error', error);
            }
        } finally {
            setIsSigningIn(false);
        }
    };

    const signOut = async () => {
        try {
            await GoogleSignin.signOut();
            setUserInfo(null);
        } catch (error) {
            console.error('Native Sign Out Error', error);
        }
    };

    return {
        userInfo,
        isSigningIn,
        signIn,
        signOut,
        idToken: userInfo?.data?.idToken ?? null,
    };
}
