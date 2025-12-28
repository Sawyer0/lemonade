import { useState, useEffect, useCallback } from 'react';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut as firebaseSignOut,
    onAuthStateChanged,
    User,
    GoogleAuthProvider,
    signInWithCredential,
    updateProfile
} from 'firebase/auth';
import { auth } from '../infrastructure/firebase/config';
import { useNativeAuth } from './useNativeAuth';
import { useIsMounted } from './useIsMounted';

export function useFirebaseAuth() {
    const [user, setUser] = useState<User | null>(auth.currentUser);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { signIn: signInWithGoogleNative, idToken } = useNativeAuth();
    const isMounted = useIsMounted();

    const handleGoogleSignIn = useCallback(async (token: string) => {
        try {
            if (isMounted()) setLoading(true);
            const credential = GoogleAuthProvider.credential(token);
            await signInWithCredential(auth, credential);
        } catch (err: unknown) {
            if (isMounted()) setError(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
            if (isMounted()) setLoading(false);
        }
    }, [isMounted]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (isMounted()) {
                setUser(user);
                setLoading(false);
            }
        });
        return unsubscribe;
    }, [isMounted]);

    useEffect(() => {
        if (idToken) {
            handleGoogleSignIn(idToken);
        }
    }, [idToken, handleGoogleSignIn]);

    const login = async (email: string, password: string) => {
        try {
            if (isMounted()) setLoading(true);
            if (isMounted()) setError(null);
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: unknown) {
            if (isMounted()) setError(err instanceof Error ? err.message : 'Login failed');
            throw err;
        } finally {
            if (isMounted()) setLoading(false);
        }
    };

    const signup = async (email: string, password: string, displayName: string) => {
        try {
            if (isMounted()) setLoading(true);
            if (isMounted()) setError(null);
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            if (userCredential.user) {
                await updateProfile(userCredential.user, { displayName });
            }
        } catch (err: unknown) {
            if (isMounted()) setError(err instanceof Error ? err.message : 'Signup failed');
            throw err;
        } finally {
            if (isMounted()) setLoading(false);
        }
    };

    const signOut = async () => {
        try {
            if (isMounted()) setLoading(true);
            await firebaseSignOut(auth);
        } catch (err: unknown) {
            if (isMounted()) setError(err instanceof Error ? err.message : 'Sign out failed');
        } finally {
            if (isMounted()) setLoading(false);
        }
    };

    return {
        user,
        loading,
        error,
        login,
        signup,
        signOut,
        signInWithGoogle: signInWithGoogleNative
    };
}