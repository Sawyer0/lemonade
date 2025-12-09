import { injectable, inject } from 'inversify';
import { ILogger } from '@/core/interfaces/ILogger';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class Logger implements ILogger {
    private isProduction = process.env.NODE_ENV === 'production';

    // In a real app, you would inject a transport like Datadog or Sentry here
    // private transport: RemoteTransport;

    info(message: string, meta?: Record<string, any>): void {
        const logEntry = {
            level: 'INFO',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        };
        console.log(JSON.stringify(logEntry));
        
        // TODO: this.transport.send(logEntry);
    }

    error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
        const logEntry = {
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            message,
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            ...meta
        };
        console.error(JSON.stringify(logEntry));

        // CRITICAL: In production, errors MUST go to a remote service
        if (this.isProduction) {
            // this.sentry.captureException(error);
        }
    }

    warn(message: string, meta?: Record<string, any>): void {
        const logEntry = { level: 'WARN', timestamp: new Date().toISOString(), message, ...meta };
        console.warn(JSON.stringify(logEntry));
    }

    debug(message: string, meta?: Record<string, any>): void {
        if (!this.isProduction) {
            console.debug(JSON.stringify({ level: 'DEBUG', message, ...meta }));
        }
    }
}