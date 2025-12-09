import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNativeAuth } from '../hooks/useNativeAuth';
import { db } from '../infrastructure/firebase/config';
import { User, UserSchema } from '../core/types/models';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

interface UserContextType {
    user: User | null;
    isLoading: boolean;
    updatePreferences: (prefs: Partial<User['preferences']>) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const { userInfo, idToken } = useNativeAuth(); // idToken availability indicates signed in
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!userInfo?.data?.user?.id) {
            setUser(null);
            setIsLoading(false);
            return;
        }

        const uid = userInfo.data.user.id;
        const userRef = doc(db, 'users', uid);

        const unsubscribe = onSnapshot(userRef, async (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                // Validate against schema, but be safe about dates
                const parsed = UserSchema.safeParse({
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
                });

                if (parsed.success) {
                    setUser(parsed.data);
                } else {
                    console.error("User Schema Validation Failed", parsed.error);
                }
            } else {
                // Create new user doc if it doesn't exist
                const newUser: User = {
                    id: uid,
                    email: userInfo.data.user.email || '',
                    displayName: userInfo.data.user.name || undefined,
                    photoUrl: userInfo.data.user.photo || undefined,
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
    }, [userInfo]);

    const updatePreferences = async (prefs: Partial<User['preferences']>) => {
        if (!user) return;
        const userRef = doc(db, 'users', user.id);

        // Merge preferences
        const updatedPrefs = { ...user.preferences, ...prefs };

        await setDoc(userRef, {
            preferences: updatedPrefs,
            updatedAt: new Date()
        }, { merge: true });
    };

    return (
        <UserContext.Provider value={{ user, isLoading, updatePreferences }}>
            {children}
        </UserContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within a UserProvider');
    }
    return context;
}
