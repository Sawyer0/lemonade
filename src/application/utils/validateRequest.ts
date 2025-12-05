import { NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';
import { AppError, ErrorCode } from '@/core/errors';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { ILogger } from '@/core/interfaces/ILogger';

/**
 * Validates a request body against a Zod schema.
 * Returns parsed data or throws an AppError with a 400 status.
 */
export async function validateRequest<T>(
    request: Request,
    schema: ZodSchema<T>
): Promise<T> {
    try {
        const body = await request.json();
        return schema.parse(body);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new AppError(
                ErrorCode.INVALID_INPUT,
                `Validation failed: ${error.issues.map(i => i.message).join(', ')}`,
                400
            );
        }
        throw error;
    }
}

/**
 * Creates a standardized error response for API routes.
 * Logs the error using the ILogger service.
 */
export function createErrorResponse(error: unknown): NextResponse {
    const logger = container.get<ILogger>(TYPES.Logger);
    const appError = AppError.fromError(error);

    logger.error(appError.message, error, {
        code: appError.code,
        statusCode: appError.statusCode
    });

    return NextResponse.json(
        { error: appError.message, code: appError.code },
        { status: appError.statusCode }
    );
}
