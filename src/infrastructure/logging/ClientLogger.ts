import { ILogger } from '@lemonade/core';
import { injectable } from 'inversify';

@injectable()
export class ClientLogger implements ILogger {
    info(message: string, context?: Record<string, unknown>): void {
        console.info(`[INFO] ${message}`, context);
    }
    error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
        console.error(`[ERROR] ${message}`, error, context);
    }
    warn(message: string, context?: Record<string, unknown>): void {
        console.warn(`[WARN] ${message}`, context);
    }
    debug(message: string, context?: Record<string, unknown>): void {
        console.debug(`[DEBUG] ${message}`, context);
    }
}