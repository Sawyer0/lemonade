export enum ErrorCode {
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',

    // Input/Validation
    INVALID_INPUT = 'INVALID_INPUT',
    MISSING_SESSION_ID = 'MISSING_SESSION_ID',
    INVALID_CONTENT_TYPE = 'INVALID_CONTENT_TYPE',

    // AI / Analysis
    AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
    AI_EMPTY_RESPONSE = 'AI_EMPTY_RESPONSE',
    AI_PARSE_ERROR = 'AI_PARSE_ERROR',

    // Safety
    SAFETY_VIOLATION = 'SAFETY_VIOLATION',

    // Auth
    UNAUTHORIZED = 'UNAUTHORIZED',

    // Payment
    STRIPE_ERROR = 'STRIPE_ERROR',
}

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(code: ErrorCode, message: string, statusCode = 500, isOperational = true) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this);
    }

    static fromError(error: unknown): AppError {
        if (error instanceof AppError) {
            return error;
        }
        if (error instanceof Error) {
            return new AppError(ErrorCode.UNKNOWN_ERROR, error.message);
        }
        return new AppError(ErrorCode.UNKNOWN_ERROR, 'An unknown error occurred');
    }
}
