import { injectable } from 'inversify';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/infrastructure/firebase/config';
import type { IAuthService } from '@/core/interfaces/IAuthService';

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
}
