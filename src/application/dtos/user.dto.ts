import { z } from 'zod';
import { UserSchema } from '@lemonade/core';

export const UpdateUserProfileRequestSchema = z.object({
    displayName: z.string().min(2).max(50).optional(),
    preferences: z
        .object({
            autoOpenCamera: z.boolean(),
        })
        .optional(),
});

export type UpdateUserProfileRequestDTO = z.infer<typeof UpdateUserProfileRequestSchema>;

export const UserResponseSchema = z.object({
    data: UserSchema,
});

export type UserResponseDTO = z.infer<typeof UserResponseSchema>;
