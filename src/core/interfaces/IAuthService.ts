import type { User } from 'firebase/auth';

/**
 * IAuthService - Manages user authentication state.
 * Provides access to the current authenticated user and loading state.
 */
export interface IAuthService {
    /**
     * Get the current authenticated user.
     */
    getUser(): User | null;

    /**
     * Subscribe to authentication state changes.
     * @param callback - Function called when auth state changes
     * @returns Unsubscribe function
     */
    onAuthStateChange(callback: (user: User | null) => void): () => void;

    /**
     * Check if authentication is currently loading.
     */
    isLoading(): boolean;
}
