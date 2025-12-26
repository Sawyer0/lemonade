import { useState, useEffect } from 'react';
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

export function useFirebaseAuth() {
    const [user, setUser] = useState<User | null>(auth.currentUser);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { signIn: signInWithGoogleNative, idToken } = useNativeAuth();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (idToken) {
            handleGoogleSignIn(idToken);
        }
    }, [idToken]);

    const handleGoogleSignIn = async (token: string) => {
        try {
            setLoading(true);
            const credential = GoogleAuthProvider.credential(token);
            await signInWithCredential(auth, credential);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
            setLoading(false);
        }
    };

    const login = async (email: string, password: string) => {
        try {
            setLoading(true);
            setError(null);
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const signup = async (email: string, password: string, displayName: string) => {
        try {
            setLoading(true);
            setError(null);
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            if (userCredential.user) {
                await updateProfile(userCredential.user, { displayName });
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Signup failed');
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        try {
            setLoading(true);
            await firebaseSignOut(auth);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Sign out failed');
        } finally {
            setLoading(false);
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
