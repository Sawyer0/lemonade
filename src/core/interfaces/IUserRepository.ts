import { User } from '@lemonade/core';

export interface IUserRepository {
    findById(userId: string): Promise<User | null>;
}
