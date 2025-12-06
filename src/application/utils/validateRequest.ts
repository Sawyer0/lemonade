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
 * Validates query parameters from a URL against a Zod schema.
 */
export function validateQueryParams<T>(
    request: Request,
    schema: ZodSchema<T>
): T {
    try {
        const { searchParams } = new URL(request.url);
        const params: Record<string, string | string[]> = {};
        searchParams.forEach((value, key) => {
            const existing = params[key];
            if (existing) {
                params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
            } else {
                params[key] = value;
            }
        });
        return schema.parse(params);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new AppError(
                ErrorCode.INVALID_INPUT,
                `Query validation failed: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
                400
            );
        }
        throw error;
    }
}

/**
 * Validates a response object against a Zod schema before sending it to the client.
 * Ensures API contract consistency and catches data type mismatches early.
 */
export function validateResponse<T>(
    data: unknown,
    schema: ZodSchema<T>
): T {
    try {
        return schema.parse(data);
    } catch (error) {
        const logger = container.get<ILogger>(TYPES.Logger);

        if (error instanceof z.ZodError) {
            const message = `Response validation failed: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
            logger.error(message, error, {
                dataType: typeof data,
                failedPaths: error.issues.map(i => i.path.join('.'))
            });
            throw new AppError(
                ErrorCode.INTERNAL_SERVER_ERROR,
                'Failed to serialize response. Check server logs.',
                500
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
