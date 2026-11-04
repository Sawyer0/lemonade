import type { User } from 'firebase/auth';

export interface IAuthService {
    getUser(): Promise<User | null>;

    /**
     * @param callback
     * @returns
     */
    onAuthStateChange(callback: (user: User | null) => void): () => void;

    /**
     * @returns
     */
    isLoading(): Promise<boolean>;

    /**
     * @param token
     */
    signInWithGoogleIdToken(token: string): Promise<void>;

    /**
     * @param email
     * @param password
     * @param username
     */
    signUpWithEmail(email: string, password: string, username: string): Promise<void>;

    /**
     * @param email
     * @param password
     */
    signInWithEmail(email: string, password: string): Promise<void>;

    signInWithGoogle(): Promise<void>;

    signOut(): Promise<void>;

    getToken(): Promise<string | undefined>;
}
