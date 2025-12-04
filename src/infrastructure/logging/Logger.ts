import { injectable } from 'inversify';
import { ILogger } from '@/core/interfaces/ILogger';

@injectable()
export class Logger implements ILogger {
    private formatMessage(level: string, message: string, context?: Record<string, any>, error?: unknown) {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            message,
            ...context,
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error
        });
    }

    info(message: string, context?: Record<string, any>): void {
        console.log(this.formatMessage('INFO', message, context));
    }

    error(message: string, error?: unknown, context?: Record<string, any>): void {
        console.error(this.formatMessage('ERROR', message, context, error));
    }

    warn(message: string, context?: Record<string, any>): void {
        console.warn(this.formatMessage('WARN', message, context));
    }

    debug(message: string, context?: Record<string, any>): void {
        // Only log debug in development or if explicitly enabled
        if (process.env.NODE_ENV !== 'production') {
            console.debug(this.formatMessage('DEBUG', message, context));
        }
    }
}
