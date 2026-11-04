'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import type { IAuthService, ILogger } from '@lemonade/core';

interface AuthContextType {
    user: User | null;
    loading: boolean;
}

declare global {
    interface Window {
        handleNativeGoogleLogin?: (token: string) => void;
    }
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe: () => void = () => {};

        const initAuth = async () => {
            try {
                const authService = clientContainer.get<IAuthService>(TYPES.AuthService);
                unsubscribe = authService.onAuthStateChange((user) => {
                    setUser(user);
                    setLoading(false);
                });

                // Bridge Handler for React Native Google Sign-In
                // The mobile app injects: window.handleNativeGoogleLogin(idToken)
                window.handleNativeGoogleLogin = async (token: string) => {
                    try {
                        // console.log("Received Native Google Token"); // kept minimal for prod
                        await authService.signInWithGoogleIdToken(token);
                    } catch (error) {
                        const logger = clientContainer.get<ILogger>(TYPES.Logger);
                        logger.error('Native Bridge Sign-In Failed:', error);
                    }
                };
            } catch (error) {
                const logger = clientContainer.get<ILogger>(TYPES.Logger);
                logger.error('Failed to initialize Auth Service:', error);
                setLoading(false);
            }
        };

        initAuth();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
