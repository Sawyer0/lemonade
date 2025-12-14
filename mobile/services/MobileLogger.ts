import { ILogger } from '@lemonade/core';

export class MobileLogger implements ILogger {
    private formatLog(level: string, message: string, context?: Record<string, unknown>, traceId?: string): Record<string, unknown> {
        return {
            level,
            timestamp: new Date().toISOString(),
            message,
            traceId,
            ...context
        };
    }

    info(message: string, context?: Record<string, unknown>, traceId?: string): void {
        const entry = this.formatLog('INFO', message, context, traceId);
        console.log(JSON.stringify(entry));
    }

    error(message: string, error?: unknown, context?: Record<string, unknown>, traceId?: string): void {
        const errorDetails = error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error;

        const entry = this.formatLog('ERROR', message, { ...context, error: errorDetails }, traceId);
        console.error(JSON.stringify(entry));
    }

    warn(message: string, context?: Record<string, unknown>, traceId?: string): void {
        const entry = this.formatLog('WARN', message, context, traceId);
        console.warn(JSON.stringify(entry));
    }

    debug(message: string, context?: Record<string, unknown>, traceId?: string): void {
        // In development, we might want to see debug logs
        if (__DEV__) {
            const entry = this.formatLog('DEBUG', message, context, traceId);
            console.debug(JSON.stringify(entry));
        }
    }
}
