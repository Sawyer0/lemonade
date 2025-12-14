import { injectable } from 'inversify';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, GoogleAuthProvider, signInWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth';
import { auth } from '@/infrastructure/firebase/config';
import { IAuthService } from '@lemonade/core';

@injectable()
export class AuthService implements IAuthService {
    private currentUser: User | null = null;
    private isLoadingState: boolean = true;

    constructor() {
        // Initialize auth state on service creation
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user;
            this.isLoadingState = false;
        });
    }

    async getUser(): Promise<User | null> {
        return this.currentUser;
    }

    onAuthStateChange(callback: (user: User | null) => void): () => void {
        return onAuthStateChanged(auth, callback);
    }

    async isLoading(): Promise<boolean> {
        return this.isLoadingState;
    }

    async signInWithGoogleIdToken(token: string): Promise<void> {
        const credential = GoogleAuthProvider.credential(token);
        await signInWithCredential(auth, credential);
    }

    async signUpWithEmail(email: string, password: string, username: string): Promise<void> {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (userCredential.user) {
            await updateProfile(userCredential.user, {
                displayName: username
            });
        }
    }

    async signInWithEmail(email: string, password: string): Promise<void> {
        await signInWithEmailAndPassword(auth, email, password);
    }

    async signInWithGoogle(): Promise<void> {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    }

    async signOut(): Promise<void> {
        await auth.signOut();
    }

    async getToken(): Promise<string | undefined> {
        return this.currentUser?.getIdToken();
    }
}
