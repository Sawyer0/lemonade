import { User } from '../types/models';

export interface IUserRepository {
    findById(userId: string): Promise<User | null>;
}
