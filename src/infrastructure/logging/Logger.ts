import { injectable, inject } from 'inversify';
import { ILogger } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';
import { RequestContext } from '@/infrastructure/context/request-context';

interface RemoteTransport {
    send(logEntry: Record<string, unknown>): void;
}

@injectable()
export class Logger implements ILogger {
    private isProduction = process.env.NODE_ENV === 'production';
    private remoteTransport: RemoteTransport | undefined;

    constructor(@inject(TYPES.RemoteLogTransport) remoteTransport?: RemoteTransport) {
        this.remoteTransport = remoteTransport;
    }

    private formatLog(level: string, message: string, context?: Record<string, unknown>): Record<string, unknown> {
        return {
            level,
            timestamp: new Date().toISOString(),
            traceId: RequestContext.getTraceId(),
            message,
            ...context
        };
    }

    info(message: string, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('INFO', message, context);
        console.log(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }

    error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('ERROR', message, {
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            ...context
        });
        console.error(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }

    warn(message: string, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('WARN', message, context);
        console.warn(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }

    debug(message: string, context?: Record<string, unknown>): void {
        if (!this.isProduction) {
            const logEntry = this.formatLog('DEBUG', message, context);
            console.debug(JSON.stringify(logEntry));
            this.remoteTransport?.send(logEntry);
        }
    }
}
