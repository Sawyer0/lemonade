import { injectable, inject, optional } from 'inversify';
import type { ILogger } from '@lemonade/core';
import { TYPES } from '../di/types';
import { RequestContext } from '../context/request-context';

export interface RemoteTransport {
    send(logEntry: Record<string, unknown>): void;
}

@injectable()
export class Logger implements ILogger {
    private remoteTransport: RemoteTransport | undefined;

    constructor(
        @inject(TYPES.RemoteLogTransport) @optional() remoteTransport?: RemoteTransport
    ) {
        this.remoteTransport = remoteTransport;
    }

    private formatLog(severity: string, message: string, context?: Record<string, unknown>): Record<string, unknown> {
        return {
            severity,
            message,
            timestamp: new Date().toISOString(),
            traceId: RequestContext.getTraceId(),
            ...context
        };
    }

    info(message: string, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('INFO', message, context);
        console.log(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }

    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('ERROR', message, {
            error: error instanceof Error ? {
                message: error.message,
                name: error.name,
                stack: error.stack
            } : error,
            ...context
        });
        console.error(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }

    warn(message: string, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('WARNING', message, context);
        console.warn(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }

    debug(message: string, context?: Record<string, unknown>): void {
        const logEntry = this.formatLog('DEBUG', message, context);
        console.debug(JSON.stringify(logEntry));
        this.remoteTransport?.send(logEntry);
    }
}
