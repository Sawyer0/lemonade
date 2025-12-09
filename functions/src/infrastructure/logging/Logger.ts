import { injectable } from 'inversify';
import { ILogger } from '../../core/interfaces/ILogger';

@injectable()
export class Logger implements ILogger {
    // In Cloud Functions, stdout/stderr are captured by Cloud Logging automatically.
    // We just need to ensure consistent JSON formatting.

    info(message: string, context?: Record<string, unknown>): void {
        const logEntry = {
            severity: 'INFO', // Cloud Logging uses 'severity' instead of 'level'
            message,
            timestamp: new Date().toISOString(),
            ...context
        };
        console.log(JSON.stringify(logEntry));
    }

    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const logEntry = {
            severity: 'ERROR',
            message,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? {
                message: error.message,
                name: error.name,
                stack: error.stack
            } : error,
            ...context
        };
        console.error(JSON.stringify(logEntry));
    }

    warn(message: string, context?: Record<string, unknown>): void {
        const logEntry = {
            severity: 'WARNING',
            message,
            timestamp: new Date().toISOString(),
            ...context
        };
        console.warn(JSON.stringify(logEntry));
    }

    debug(message: string, context?: Record<string, unknown>): void {
        const logEntry = {
            severity: 'DEBUG',
            message,
            timestamp: new Date().toISOString(),
            ...context
        };
        console.debug(JSON.stringify(logEntry));
    }
}
