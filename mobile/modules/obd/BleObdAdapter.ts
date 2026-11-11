// --- BLE OBD adapter (LM-03) ---
// An IObdAdapter over a BLE UART peripheral: the transport frames ELM327
// commands, the peripheral moves the bytes. One adapter instance is bound
// to one scanned device; scanning itself lives in BlePlxObdPeripheral.
import type { IObdAdapter, ObdAdapterInfo } from '@lemonade/core';
import { BleObdTransport } from './BleObdTransport';
import type { ObdBlePeripheral } from './ObdBlePeripheral';

export class BleObdAdapter implements IObdAdapter {
    public readonly adapterInfo: ObdAdapterInfo;
    private readonly transport: BleObdTransport;
    private readonly deviceId: string;

    constructor(
        private readonly peripheral: ObdBlePeripheral,
        deviceId: string,
        deviceName: string | null,
    ) {
        this.deviceId = deviceId;
        this.transport = new BleObdTransport(peripheral);
        this.adapterInfo = { name: deviceName ?? 'OBD adapter', transport: 'ble' };
    }

    public get isConnected(): boolean {
        return this.peripheral.isConnected;
    }

    public async connect(): Promise<void> {
        await this.peripheral.connect(this.deviceId);
    }

    public async disconnect(): Promise<void> {
        await this.peripheral.disconnect();
    }

    public async sendCommand(command: string): Promise<string> {
        return this.transport.sendCommand(command);
    }
}
