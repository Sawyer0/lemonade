// --- BLE ELM327 transport (LM-03) ---
// Sends ELM327 commands over a BLE UART peripheral and frames replies on
// the `>` prompt. The ELM327 link is strictly one command at a time, so
// sends are queued; a command that gets no prompt within the timeout fails
// instead of hanging the scan. The transport returns raw reply text —
// echo stripping and parsing live in @lemonade/core, not here.
import { ObdError, type IObdTransport } from '@lemonade/core';
import type { ObdBlePeripheral } from './ObdBlePeripheral';

interface PendingCommand {
    buffer: string;
    resolve: (reply: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class BleObdTransport implements IObdTransport {
    private queue: Promise<void> = Promise.resolve();
    private pending: PendingCommand | null = null;

    constructor(
        private readonly peripheral: ObdBlePeripheral,
        private readonly responseTimeoutMs: number = 5000,
    ) {
        this.peripheral.onResponse((text) => this.handleIncoming(text));
    }

    /** Sends one command and resolves with the reply text up to the `>` prompt. */
    public async sendCommand(command: string): Promise<string> {
        const run = this.queue.then(() => this.exchange(command));
        this.queue = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private async exchange(command: string): Promise<string> {
        if (!this.peripheral.isConnected) {
            throw new ObdError('not-connected', 'OBD adapter is not connected.');
        }
        if (this.pending) {
            throw new ObdError('adapter', 'A command is already in flight on the OBD link.');
        }
        return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending = null;
                reject(
                    new ObdError(
                        'timeout',
                        `OBD adapter did not answer '${command}' within ${this.responseTimeoutMs} ms.`,
                    ),
                );
            }, this.responseTimeoutMs);
            this.pending = { buffer: '', resolve, reject, timer };
            this.peripheral.write(`${command}\r`).catch((error: unknown) => {
                clearTimeout(timer);
                this.pending = null;
                reject(
                    error instanceof Error
                        ? error
                        : new ObdError('adapter', `Failed to write '${command}' to the OBD adapter.`),
                );
            });
        });
    }

    private handleIncoming(text: string): void {
        if (!this.pending) return;
        this.pending.buffer += text;
        if (this.pending.buffer.includes('>')) {
            const { buffer, resolve, timer } = this.pending;
            this.pending = null;
            clearTimeout(timer);
            resolve(buffer);
        }
    }
}
