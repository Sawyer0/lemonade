import React, { createContext, useContext, useState, useEffect } from 'react';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { db } from '../infrastructure/firebase/config';
import { User, UserSchema } from '@lemonade/core';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

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
        signInWithGoogle 
    } = useFirebaseAuth();
    
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (firebaseLoading) return;

        if (!firebaseUser) {
            setTimeout(() => {
                setUser(null);
                setIsLoading(false);
            }, 0);
            return;
        }

        const userRef = doc(db, 'users', firebaseUser.uid);

        const unsubscribe = onSnapshot(userRef, async (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const parsed = UserSchema.safeParse({
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
                    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
                });

                if (parsed.success) {
                    setUser(parsed.data);
                } else {
                    console.error("User Schema Validation Failed", parsed.error.message);
                }
            } else {
                // Create new user doc if it doesn't exist
                const newUser: User = {
                    id: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    displayName: firebaseUser.displayName || undefined,
                    photoUrl: firebaseUser.photoURL || undefined,
                    tier: 'free',
                    preferences: { autoOpenCamera: false },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await setDoc(userRef, newUser);
                setUser(newUser);
            }
            setIsLoading(false);
        }, (err) => {
            console.error("User Snapshot Error", err);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [firebaseUser, firebaseLoading]);

    const updatePreferences = async (prefs: Partial<User['preferences']>) => {
        if (!user) return;
        const userRef = doc(db, 'users', user.id);
        const updatedPrefs = { ...user.preferences, ...prefs };

        await setDoc(userRef, {
            preferences: updatedPrefs,
            updatedAt: new Date()
        }, { merge: true });
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            isLoading: isLoading || firebaseLoading, 
            login, 
            signup, 
            signOut, 
            signInWithGoogle,
            updatePreferences 
        }}>
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
