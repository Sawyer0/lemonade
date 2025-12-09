import type { User } from 'firebase/auth';

/**
 * IAuthService - Manages user authentication state.
 * Provides access to the current authenticated user and loading state.
 */
export interface IAuthService {
    /**
     * Get the current authenticated user.
     */
    getUser(): Promise<User | null>;

    /**
     * Subscribe to authentication state changes.
     * @param callback - Function called when auth state changes
     * @returns Unsubscribe function
     */
    onAuthStateChange(callback: (user: User | null) => void): () => void;

    /**
     * Check if authentication is currently loading.
     */
    isLoading(): Promise<boolean>;

    /**
     * Sign in using a Google ID token (bridged from Native Mobile App).
     * @param token - The Google ID token
     */
    signInWithGoogleIdToken(token: string): Promise<void>;

    /**
     * Sign up a new user with email and password.
     * @param email - The user's email address.
     * @param password - The user's password.
     * @param username - The user's desired username.
     */
    signUpWithEmail(email: string, password: string, username: string): Promise<void>;

    /**
     * Sign in an existing user with email and password.
     * @param email - The user's email address.
     * @param password - The user's password.
     */
    signInWithEmail(email: string, password: string): Promise<void>;
    /**
     * Sign in using Google (Web Flow).
     */
    signInWithGoogle(): Promise<void>;

    /**
     * Sign out the current user.
     */
    signOut(): Promise<void>;

    /**
     * Get the current user's ID token.
     */
    getToken(): Promise<string | undefined>;
}
