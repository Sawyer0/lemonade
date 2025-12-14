"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
const codes_1 = require("./codes");
class AppError extends Error {
    constructor(code, message, statusCode = 500, isOperational = true) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this);
    }
    static fromError(error) {
        if (error instanceof AppError) {
            return error;
        }
        if (error instanceof Error) {
            return new AppError(codes_1.ErrorCode.UNKNOWN_ERROR, error.message);
        }
        return new AppError(codes_1.ErrorCode.UNKNOWN_ERROR, 'An unknown error occurred');
    }
}
exports.AppError = AppError;
