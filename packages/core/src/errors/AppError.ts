import { ErrorCode } from './codes';
import { ZodError } from 'zod';

// Map ErrorCode to HTTP status codes
const errorCodeToStatusCode: Record<ErrorCode, number> = {
    [ErrorCode.UNKNOWN_ERROR]: 500,
    [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
    [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,

    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.UNAUTHENTICATED]: 401,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.PERMISSION_DENIED]: 403,
    [ErrorCode.USER_NOT_FOUND]: 404,

    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.INVALID_INPUT]: 400,
    [ErrorCode.MISSING_REQUIRED_PARAMETERS]: 400,

    [ErrorCode.RESOURCE_NOT_FOUND]: 404,
    [ErrorCode.RESOURCE_ALREADY_EXISTS]: 409,

    [ErrorCode.PAYMENT_REQUIRED]: 402,
    [ErrorCode.SUBSCRIPTION_INACTIVE]: 402,
    [ErrorCode.STRIPE_ERROR]: 500,

    [ErrorCode.AI_SERVICE_ERROR]: 502,
    [ErrorCode.SAFETY_VIOLATION]: 422,
    [ErrorCode.VIDEO_PROCESSING_FAILED]: 500,
    [ErrorCode.AI_EMPTY_RESPONSE]: 502,
    [ErrorCode.AI_PARSE_ERROR]: 502,

    [ErrorCode.INVALID_CONTENT_TYPE]: 415,
};

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(code: ErrorCode, message: string, statusCode?: number, isOperational = true) {
        super(message);
        this.code = code;
        // Use provided statusCode or derive from ErrorCode mapping
        this.statusCode = statusCode ?? errorCodeToStatusCode[code] ?? 500;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this);
    }

    static fromError(error: unknown): AppError {
        if (error instanceof AppError) {
            return error;
        }

        // Handle Zod validation errors
        if (error instanceof ZodError) {
            const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
            return new AppError(ErrorCode.VALIDATION_ERROR, messages);
        }

        if (error instanceof Error) {
            return new AppError(ErrorCode.UNKNOWN_ERROR, error.message);
        }
        return new AppError(ErrorCode.UNKNOWN_ERROR, 'An unknown error occurred');
    }
}
