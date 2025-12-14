import { ErrorCode } from './codes';
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly isOperational: boolean;
    constructor(code: ErrorCode, message: string, statusCode?: number, isOperational?: boolean);
    static fromError(error: unknown): AppError;
}
