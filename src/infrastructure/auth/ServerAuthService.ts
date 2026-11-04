import { injectable } from 'inversify';
import { adminAuth } from '@lemonade/infrastructure';
import { IServerAuthService } from '@lemonade/core';
import { DecodedIdToken } from 'firebase-admin/auth';

@injectable()
export class ServerAuthService implements IServerAuthService {
    async verifyToken(token: string): Promise<DecodedIdToken> {
        return adminAuth.verifyIdToken(token);
    }
}
