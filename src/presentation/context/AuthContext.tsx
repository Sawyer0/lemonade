"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { clientContainer } from "@/infrastructure/di/clientContainer";
import { TYPES } from "@/infrastructure/di/types";
import type { IAuthService } from "@/core/interfaces/IAuthService";

interface AuthContextType {
    user: User | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const authService = clientContainer.get<IAuthService>(TYPES.AuthService);
        const unsubscribe = authService.onAuthStateChange((user) => {
            setUser(user);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
