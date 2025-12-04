import { ErrorCode } from './codes';

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(code: ErrorCode, message: string, statusCode = 500, isOperational = true) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype); // Restore prototype chain
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
