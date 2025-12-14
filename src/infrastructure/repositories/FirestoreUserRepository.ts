import { injectable, inject } from 'inversify';
import { adminDb } from '@/infrastructure/firebase/admin';
import type { ILogger } from '@lemonade/core';
import { IUserRepository, User, UserSchema, AppError, ErrorCode } from '@lemonade/core';
import { convertTimestamps } from '@/infrastructure/firestore/timestamps';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class FirestoreUserRepository implements IUserRepository {
    constructor(@inject(TYPES.Logger) private logger: ILogger) { }

    private repairUserData(data: any): any {
        if (!data) return data;


        if (!data.tier) {
            this.logger.warn(`[UserRepo] Missing tier for user ${data.id || 'unknown'}. Defaulting to 'free'.`);
            data.tier = 'free';
        }


        if (!data.preferences) {
            data.preferences = { autoOpenCamera: false };
        }


        if (!data.createdAt) {
            data.createdAt = new Date();
        }
        if (!data.updatedAt) {
            data.updatedAt = data.createdAt;
        }

        return data;
    }

    async findById(userId: string): Promise<User | null> {
        const userDoc = await adminDb.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return null;
        }

        const data = convertTimestamps(userDoc.data());

        const result = UserSchema.safeParse(data);

        if (!result.success) {
            this.logger.warn(`[UserRepo] Validation failed for ${userId}. Attempting repair...`, { error: result.error });

            // Attempt Repair
            const repairedData = this.repairUserData(data);
            const retryResult = UserSchema.safeParse(repairedData);

            if (!retryResult.success) {
                this.logger.error(`[UserRepo] FATAL: User data corrupted beyond repair for ${userId}`, { error: retryResult.error });
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, `User data corrupted for ${userId}`);
            }

            return retryResult.data;
        }

        return result.data;
    }
}