// --- OBD adapter transport (LM-03) ---
// The seam the issue asks for: everything above this interface speaks
// ELM327 text, everything below it speaks to one adapter. A BLE adapter, a
// Wi-Fi adapter and the scripted emulator all implement IObdTransport, so
// the capture service never knows which one it is talking to.
import { ObdError } from './elm327';
import type { ObdAdapterInfo } from './types';

/**
 * One ELM327 exchange: send a command (`03`, `01 0C`, `ATZ`, ...) and get
 * the adapter's raw text reply back. Implementations own framing, timeouts
 * and reconnection; a transport that cannot reach the adapter raises
 * ObdError, never returns a made-up reply.
 */
export interface IObdTransport {
    sendCommand(command: string): Promise<string>;
}

/** A connected adapter: a transport plus lifecycle and identity. */
export interface IObdAdapter extends IObdTransport {
    readonly adapterInfo: ObdAdapterInfo;
    readonly isConnected: boolean;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
}

function normalizeCommand(command: string): string {
    return command.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * The ELM327 emulator: a scripted adapter for tests, CI and development.
 * Commands map to canned replies (keyed case- and space-insensitively); a
 * command with no scripted reply gets `defaultResponse`. Every command
 * sent is recorded, so a test can assert the exact exchange the capture
 * service performed — including the init sequence and the modes it asked
 * for. This is the emulator the issue asks for in CI.
 */
export class FakeObdAdapter implements IObdAdapter {
    public readonly adapterInfo: ObdAdapterInfo;
    public readonly sentCommands: string[] = [];
    private connected = false;
    private readonly scripted: ReadonlyMap<string, string>;
    private readonly defaultResponse: string;

    constructor(
        scriptedResponses: Readonly<Record<string, string>> = {},
        options: { adapterInfo?: ObdAdapterInfo; defaultResponse?: string } = {},
    ) {
        this.scripted = new Map(
            Object.entries(scriptedResponses).map(([command, response]) => [normalizeCommand(command), response]),
        );
        this.adapterInfo = options.adapterInfo ?? { name: 'ELM327 emulator', transport: 'emulator' };
        this.defaultResponse = options.defaultResponse ?? 'NO DATA\r\r>';
    }

    public get isConnected(): boolean {
        return this.connected;
    }

    public async connect(): Promise<void> {
        this.connected = true;
    }

    public async disconnect(): Promise<void> {
        this.connected = false;
    }

    public async sendCommand(command: string): Promise<string> {
        if (!this.connected) {
            throw new ObdError('not-connected', 'Fake adapter is not connected. Call connect() first.');
        }
        const normalized = normalizeCommand(command);
        this.sentCommands.push(normalized);
        return this.scripted.get(normalized) ?? this.defaultResponse;
    }
}
