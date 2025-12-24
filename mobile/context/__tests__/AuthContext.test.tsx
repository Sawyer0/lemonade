import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthContext';
import { useFirebaseAuth } from '../../hooks/useFirebaseAuth';
import { onSnapshot, setDoc, doc } from 'firebase/firestore';
import { UserSchema } from '@lemonade/core';

// Mocks
jest.mock('../../hooks/useFirebaseAuth');
jest.mock('firebase/firestore');
jest.mock('../../infrastructure/firebase/config', () => ({
    db: {}
}));

describe('AuthContext', () => {
    const mockFirebaseUser = {
        uid: 'test-uid',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useFirebaseAuth as jest.Mock).mockReturnValue({
            user: null,
            loading: false,
            login: jest.fn(),
            signup: jest.fn(),
            signOut: jest.fn(),
            signInWithGoogle: jest.fn()
        });
    });

    it('should provide null user when not authenticated', () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.user).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });

    it('should sync user profile from Firestore when authenticated', async () => {
        (useFirebaseAuth as jest.Mock).mockReturnValue({
            user: mockFirebaseUser,
            loading: false,
            login: jest.fn(),
            signup: jest.fn(),
            signOut: jest.fn(),
            signInWithGoogle: jest.fn()
        });

        const mockProfile = {
            id: 'test-uid',
            email: 'test@example.com',
            displayName: 'Test User',
            tier: 'free',
            preferences: { autoOpenCamera: false },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        (onSnapshot as jest.Mock).mockImplementation((ref, callback) => {
            callback({
                exists: () => true,
                data: () => mockProfile
            });
            return jest.fn();
        });

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AuthProvider>{children}</AuthProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });

        await act(async () => {});

        expect(result.current.user).toEqual(expect.objectContaining({
            id: 'test-uid',
            email: 'test@example.com'
        }));
    });
});
