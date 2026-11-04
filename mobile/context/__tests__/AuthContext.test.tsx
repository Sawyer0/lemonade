import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthContext';
import { useFirebaseAuth } from '../../hooks/useFirebaseAuth';
import { onSnapshot } from 'firebase/firestore';

// Mocks
jest.mock('../../hooks/useFirebaseAuth');
jest.mock('firebase/firestore', () => ({
    onSnapshot: jest.fn(),
    doc: jest.fn(),
    setDoc: jest.fn().mockResolvedValue(undefined),
    getFirestore: jest.fn(() => ({})),
    collection: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    getDocs: jest.fn(),
}));
jest.mock('../../infrastructure/firebase/config', () => ({
    db: {},
}));

describe('AuthContext', () => {
    const mockFirebaseUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
    };

    const mockLogin = jest.fn();
    const mockSignup = jest.fn();
    const mockSignOut = jest.fn();
    const mockSignInWithGoogle = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useFirebaseAuth as jest.Mock).mockReturnValue({
            user: null,
            loading: false,
            login: mockLogin,
            signup: mockSignup,
            signOut: mockSignOut,
            signInWithGoogle: mockSignInWithGoogle,
        });
    });

    it('should provide null user when not authenticated', async () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.user).toBeNull();
    });

    it('should sync user profile from Firestore when authenticated', async () => {
        (useFirebaseAuth as jest.Mock).mockReturnValue({
            user: mockFirebaseUser,
            loading: false,
            login: mockLogin,
            signup: mockSignup,
            signOut: mockSignOut,
            signInWithGoogle: mockSignInWithGoogle,
        });

        const mockProfile = {
            id: 'test-uid',
            email: 'test@example.com',
            displayName: 'Test User',
            tier: 'free',
            preferences: { autoOpenCamera: false },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
            callback({
                exists: () => true,
                data: () => mockProfile,
            });
            return jest.fn();
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.user).toEqual(
            expect.objectContaining({
                id: 'test-uid',
                email: 'test@example.com',
            }),
        );
    });

    describe('Auth Error Handling', () => {
        it('should handle login failure', async () => {
            mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: null,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await act(async () => {
                await expect(result.current.login('test@test.com', 'password')).rejects.toThrow('Invalid credentials');
            });
        });

        it('should handle signup failure', async () => {
            mockSignup.mockRejectedValueOnce(new Error('Email already in use'));

            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: null,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await act(async () => {
                await expect(result.current.signup('test@test.com', 'password')).rejects.toThrow(
                    'Email already in use',
                );
            });
        });

        it('should handle signOut failure', async () => {
            mockSignOut.mockRejectedValueOnce(new Error('Sign out failed'));

            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: mockFirebaseUser,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await act(async () => {
                await expect(result.current.signOut()).rejects.toThrow('Sign out failed');
            });
        });

        it('should handle Google sign-in failure', async () => {
            mockSignInWithGoogle.mockRejectedValueOnce(new Error('Google sign-in cancelled'));

            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: null,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await act(async () => {
                await expect(result.current.signInWithGoogle()).rejects.toThrow('Google sign-in cancelled');
            });
        });
    });

    describe('Firestore Sync Edge Cases', () => {
        it('should handle Firestore snapshot error', async () => {
            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: mockFirebaseUser,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            (onSnapshot as jest.Mock).mockImplementation((ref, onSuccess, onError) => {
                onError(new Error('Permission denied'));
                return jest.fn();
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // User should still be null since profile sync failed
            expect(result.current.user).toBeNull();
        });

        it('should handle profile document not existing', async () => {
            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: mockFirebaseUser,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
                callback({
                    exists: () => false,
                    data: () => null,
                });
                return jest.fn();
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should handle malformed profile data', async () => {
            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: mockFirebaseUser,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            const malformedProfile = {
                // Missing required fields
                email: 'test@example.com',
            };

            (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
                callback({
                    exists: () => true,
                    data: () => malformedProfile,
                });
                return jest.fn();
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // Should handle gracefully without crashing
        });

        it('should cleanup Firestore subscription on unmount', async () => {
            const mockUnsubscribe = jest.fn();

            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: mockFirebaseUser,
                loading: false,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
                callback({
                    exists: () => true,
                    data: () => ({
                        id: 'test-uid',
                        email: 'test@example.com',
                        displayName: 'Test',
                        tier: 'free',
                        preferences: {},
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }),
                });
                return mockUnsubscribe;
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { unmount } = renderHook(() => useAuth(), { wrapper });

            unmount();

            expect(mockUnsubscribe).toHaveBeenCalled();
        });

        it('should handle rapid auth state changes', async () => {
            (useFirebaseAuth as jest.Mock).mockImplementation(() => {
                const [state] = React.useState({ user: null, loading: true });
                return {
                    ...state,
                    login: mockLogin,
                    signup: mockSignup,
                    signOut: mockSignOut,
                    signInWithGoogle: mockSignInWithGoogle,
                };
            });

            (onSnapshot as jest.Mock).mockImplementation(() => {
                return jest.fn();
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            // Should handle without crashing
            expect(result.current.isLoading).toBe(true);
        });
    });

    describe('Loading State Edge Cases', () => {
        it('should show loading during initial auth check', () => {
            (useFirebaseAuth as jest.Mock).mockReturnValue({
                user: null,
                loading: true,
                login: mockLogin,
                signup: mockSignup,
                signOut: mockSignOut,
                signInWithGoogle: mockSignInWithGoogle,
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result } = renderHook(() => useAuth(), { wrapper });

            expect(result.current.isLoading).toBe(true);
        });

        it('should transition from loading to authenticated', async () => {
            (useFirebaseAuth as jest.Mock)
                .mockReturnValueOnce({
                    user: null,
                    loading: true,
                    login: mockLogin,
                    signup: mockSignup,
                    signOut: mockSignOut,
                    signInWithGoogle: mockSignInWithGoogle,
                })
                .mockReturnValue({
                    user: mockFirebaseUser,
                    loading: false,
                    login: mockLogin,
                    signup: mockSignup,
                    signOut: mockSignOut,
                    signInWithGoogle: mockSignInWithGoogle,
                });

            (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
                callback({
                    exists: () => true,
                    data: () => ({
                        id: 'test-uid',
                        email: 'test@example.com',
                        displayName: 'Test',
                        tier: 'free',
                        preferences: {},
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }),
                });
                return jest.fn();
            });

            const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
            const { result, rerender } = renderHook(() => useAuth(), { wrapper });

            // Initial loading state
            expect(result.current.isLoading).toBe(true);

            // Trigger rerender
            rerender({});

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });
    });
});
