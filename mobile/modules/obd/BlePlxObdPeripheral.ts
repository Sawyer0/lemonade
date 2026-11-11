// --- react-native-ble-plx peripheral (LM-03) ---
// The concrete ObdBlePeripheral for the M1 adapter (OBDLink CX / MX+ over
// BLE UART). Scans for adapters advertising the UART service, connects,
// discovers characteristics, and forwards notify text to the transport.
// Base64 helpers are local: ELM327 text is ASCII, and the app does not
// ship a Buffer polyfill for this.
import { BleManager, State, type Subscription } from 'react-native-ble-plx';
import { ObdError } from '@lemonade/core';
import type { ObdBlePeripheral, ScannedObdAdapter } from './ObdBlePeripheral';
import { OBD_UART_NOTIFY_UUID, OBD_UART_SERVICE_UUID, OBD_UART_WRITE_UUID } from './ObdBlePeripheral';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(text: string): string {
    let output = '';
    for (let index = 0; index < text.length; index += 3) {
        const first = text.charCodeAt(index);
        const second = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
        const third = index + 2 < text.length ? text.charCodeAt(index + 2) : 0;
        output += BASE64_ALPHABET[first >> 2];
        output += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
        output += index + 1 < text.length ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)] : '=';
        output += index + 2 < text.length ? BASE64_ALPHABET[third & 0x3f] : '=';
    }
    return output;
}

export function fromBase64(encoded: string): string {
    const cleaned = encoded.replace(/[^A-Za-z0-9+/=]/g, '');
    let output = '';
    for (let index = 0; index < cleaned.length; index += 4) {
        const first = BASE64_ALPHABET.indexOf(cleaned[index] as string);
        const second = BASE64_ALPHABET.indexOf(cleaned[index + 1] as string);
        const third = cleaned[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(cleaned[index + 2] as string);
        const fourth = cleaned[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(cleaned[index + 3] as string);
        output += String.fromCharCode((first << 2) | (second >> 4));
        if (cleaned[index + 2] !== '=') output += String.fromCharCode(((second & 0x0f) << 4) | (third >> 2));
        if (cleaned[index + 3] !== '=') output += String.fromCharCode(((third & 0x03) << 6) | fourth);
    }
    return output;
}

/**
 * Scans for BLE adapters advertising the UART service. Returns every
 * adapter found within the timeout; an empty list means nothing advertising
 * was in range, not an error.
 */
export async function scanForObdAdapters(
    manager: BleManager,
    serviceUuid: string = OBD_UART_SERVICE_UUID,
    timeoutMs: number = 10000,
): Promise<ScannedObdAdapter[]> {
    const state = await manager.state();
    if (state !== State.PoweredOn) {
        throw new ObdError('not-connected', 'Bluetooth is not on. Turn Bluetooth on and try again.');
    }
    const found = new Map<string, ScannedObdAdapter>();
    await manager.startDeviceScan([serviceUuid], { allowDuplicates: false }, (error, device) => {
        if (error || !device) return;
        found.set(device.id, { id: device.id, name: device.name });
    });
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    await manager.stopDeviceScan();
    return [...found.values()];
}

export class BlePlxObdPeripheral implements ObdBlePeripheral {
    private deviceId: string | null = null;
    private monitorSubscription: Subscription | null = null;
    private readonly listeners = new Set<(text: string) => void>();

    constructor(
        private readonly manager: BleManager,
        private readonly serviceUuid: string = OBD_UART_SERVICE_UUID,
        private readonly writeUuid: string = OBD_UART_WRITE_UUID,
        private readonly notifyUuid: string = OBD_UART_NOTIFY_UUID,
    ) {}

    public get isConnected(): boolean {
        return this.deviceId !== null;
    }

    public async connect(deviceId: string): Promise<void> {
        const state = await this.manager.state();
        if (state !== State.PoweredOn) {
            throw new ObdError('not-connected', 'Bluetooth is not on. Turn Bluetooth on and try again.');
        }
        const device = await this.manager.connectToDevice(deviceId);
        await device.discoverAllServicesAndCharacteristics();
        this.deviceId = device.id;
        this.monitorSubscription = this.manager.monitorCharacteristicForDevice(
            device.id,
            this.serviceUuid,
            this.notifyUuid,
            (error, characteristic) => {
                if (error || !characteristic?.value) return;
                const text = fromBase64(characteristic.value);
                for (const listener of this.listeners) listener(text);
            },
        );
    }

    public async disconnect(): Promise<void> {
        if (this.monitorSubscription) {
            this.monitorSubscription.remove();
            this.monitorSubscription = null;
        }
        if (this.deviceId) {
            const deviceId = this.deviceId;
            this.deviceId = null;
            await this.manager.cancelDeviceConnection(deviceId);
        }
    }

    public async write(text: string): Promise<void> {
        if (!this.deviceId) {
            throw new ObdError('not-connected', 'OBD adapter is not connected.');
        }
        await this.manager.writeCharacteristicWithResponseForDevice(
            this.deviceId,
            this.serviceUuid,
            this.writeUuid,
            toBase64(text),
        );
    }

    public onResponse(listener: (text: string) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
