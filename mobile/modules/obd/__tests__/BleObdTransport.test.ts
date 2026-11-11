import { BleObdTransport } from '../BleObdTransport';
import type { ObdBlePeripheral } from '../ObdBlePeripheral';
import { ObdError } from '@lemonade/core';

/** A scripted peripheral: records writes, replays canned replies on demand. */
class FakePeripheral implements ObdBlePeripheral {
    public readonly written: string[] = [];
    public connected = false;
    private readonly listeners = new Set<(text: string) => void>();

    public get isConnected(): boolean {
        return this.connected;
    }

    public async connect(): Promise<void> {
        this.connected = true;
    }

    public async disconnect(): Promise<void> {
        this.connected = false;
    }

    public async write(text: string): Promise<void> {
        if (!this.connected) throw new Error('not connected');
        this.written.push(text);
    }

    public onResponse(listener: (text: string) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public emit(text: string): void {
        for (const listener of this.listeners) listener(text);
    }
}

describe('BleObdTransport', () => {
    // sendCommand queues the exchange behind a resolved promise, so the
    // test must let that microtask run before emitting the reply.
    const flushQueue = async (): Promise<void> => {
        await Promise.resolve();
        await Promise.resolve();
    };

    it('resolves with the reply text up to the prompt', async () => {
        const peripheral = new FakePeripheral();
        await peripheral.connect();
        const transport = new BleObdTransport(peripheral);

        const reply = transport.sendCommand('03');
        await flushQueue();
        peripheral.emit('43 03 00\r\r>');
        await expect(reply).resolves.toBe('43 03 00\r\r>');

        expect(peripheral.written).toEqual(['03\r']);
    });

    it('accumulates chunked replies before resolving', async () => {
        const peripheral = new FakePeripheral();
        await peripheral.connect();
        const transport = new BleObdTransport(peripheral);

        const reply = transport.sendCommand('0100');
        await flushQueue();
        peripheral.emit('41 00 BE ');
        peripheral.emit('1F A8 13\r\r>');
        await expect(reply).resolves.toBe('41 00 BE 1F A8 13\r\r>');
    });

    it('sends commands one at a time, in order', async () => {
        const peripheral = new FakePeripheral();
        await peripheral.connect();
        const transport = new BleObdTransport(peripheral);

        const first = transport.sendCommand('03');
        const second = transport.sendCommand('07');
        await flushQueue();
        peripheral.emit('43 03 00\r\r>');
        await expect(first).resolves.toBe('43 03 00\r\r>');
        // The second command is only written once the first reply arrives.
        expect(peripheral.written).toEqual(['03\r', '07\r']);
        peripheral.emit('47 03 00\r\r>');
        await expect(second).resolves.toBe('47 03 00\r\r>');
    });

    it('rejects when no prompt arrives within the timeout', async () => {
        const peripheral = new FakePeripheral();
        await peripheral.connect();
        const transport = new BleObdTransport(peripheral, 20);

        await expect(transport.sendCommand('03')).rejects.toBeInstanceOf(ObdError);
        try {
            await transport.sendCommand('03');
        } catch (error) {
            expect((error as ObdError).kind).toBe('timeout');
        }
    });

    it('rejects while disconnected', async () => {
        const peripheral = new FakePeripheral();
        const transport = new BleObdTransport(peripheral);

        await expect(transport.sendCommand('03')).rejects.toMatchObject({ kind: 'not-connected' });
        expect(peripheral.written).toEqual([]);
    });
});
