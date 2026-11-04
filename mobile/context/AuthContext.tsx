import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { db } from '../infrastructure/firebase/config';
import { User, UserSchema } from '@lemonade/core';
import { doc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, displayName: string) => Promise<void>;
    signOut: () => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    updatePreferences: (prefs: Partial<User['preferences']>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const {
        user: firebaseUser,
        loading: firebaseLoading,
        login,
        signup,
        signOut,
        signInWithGoogle,
    } = useFirebaseAuth();

    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const unsubscribeRef = useRef<Unsubscribe | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        // Cleanup previous subscription
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }

        if (firebaseLoading) {
            return;
        }

        if (!firebaseUser) {
            if (isMountedRef.current) {
                // Defer to avoid synchronous cascade warning
                const timer = setTimeout(() => {
                    if (isMountedRef.current) {
                        if (user !== null || isLoading) {
                            setUser(null);
                            setIsLoading(false);
                        }
                    }
                }, 0);
                return () => clearTimeout(timer);
            }
            return;
        }

        const userRef = doc(db, 'users', firebaseUser.uid);

        unsubscribeRef.current = onSnapshot(
            userRef,
            async (snapshot) => {
                if (!isMountedRef.current) return;

                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const parsed = UserSchema.safeParse({
                        ...data,
                        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
                        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
                    });

                    if (parsed.success) {
                        const newUser = parsed.data;
                        setUser((prev) => {
                            if (!prev) return newUser;
                            // Use updatedAt timestamp for equality check to avoid redundant renders
                            if (prev.updatedAt.getTime() === newUser.updatedAt.getTime()) {
                                return prev;
                            }
                            return newUser;
                        });
                    } else {
                        console.error('User Schema Validation Failed', parsed.error.message);
                        setUser(null);
                    }
                } else {
                    // ... create user ...
                    // ...
                }
                if (isMountedRef.current && isLoading) {
                    setIsLoading(false);
                }
            },
            (err) => {
                console.error('User Snapshot Error', err);
                if (isMountedRef.current) {
                    setUser(null);
                    setIsLoading(false);
                }
            },
        );

        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = null;
            }
        };
    }, [firebaseUser, firebaseLoading, user, isLoading]);

    const updatePreferences = useCallback(
        async (prefs: Partial<User['preferences']>) => {
            if (!user) return;
            const userRef = doc(db, 'users', user.id);
            const updatedPrefs = { ...user.preferences, ...prefs };

            await setDoc(
                userRef,
                {
                    preferences: updatedPrefs,
                    updatedAt: new Date(),
                },
                { merge: true },
            );
        },
        [user],
    );

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading: isLoading || firebaseLoading,
                login,
                signup,
                signOut,
                signInWithGoogle,
                updatePreferences,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
