import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../AuthService';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/infrastructure/firebase/config';

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: vi.fn(),
    GoogleAuthProvider: {
        credential: vi.fn(),
    },
    signInWithCredential: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    updateProfile: vi.fn(),
    signInWithPopup: vi.fn(),
}));

vi.mock('@/infrastructure/firebase/config', () => ({
    auth: {
        signOut: vi.fn(),
    },
}));

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with onAuthStateChanged listener', () => {
        new AuthService();
        expect(onAuthStateChanged).toHaveBeenCalledWith(auth, expect.any(Function));
    });

    it('should update currentUser when auth state changes', async () => {
        let authCallback: any;
        (onAuthStateChanged as any).mockImplementation((_auth: any, callback: any) => {
            authCallback = callback;
            return vi.fn();
        });

        const service = new AuthService();
        const mockUser = { uid: 'test-uid', email: 'test@example.com' } as any;

        // Trigger callback
        authCallback(mockUser);

        const user = await service.getUser();
        expect(user).toBe(mockUser);
        expect(await service.isLoading()).toBe(false);
    });

    it('should allow subscribing to auth state changes', () => {
        const service = new AuthService();
        const callback = vi.fn();
        
        service.onAuthStateChange(callback);
        
        expect(onAuthStateChanged).toHaveBeenCalled();
    });

    it('should handle signOut', async () => {
        const service = new AuthService();
        await service.signOut();
        expect(auth.signOut).toHaveBeenCalled();
    });
});
