// --- OBD BLE peripheral (LM-03) ---
// The thin seam between the ELM327 transport and react-native-ble-plx.
// The transport only knows this interface: write bytes, get text back.
// Anything that can do that — BLE, Wi-Fi, a test fake — plugs in below it.

export interface ScannedObdAdapter {
    id: string;
    name: string | null;
}

/** One BLE UART link to an adapter. Text written is ELM327 commands; text received is ELM327 replies. */
export interface ObdBlePeripheral {
    readonly isConnected: boolean;
    connect(deviceId: string): Promise<void>;
    disconnect(): Promise<void>;
    write(text: string): Promise<void>;
    /** Subscribes to reply text; returns an unsubscribe function. */
    onResponse(listener: (text: string) => void): () => void;
}

// --- Nordic UART Service (LM-03) ---
// OBDLink CX / MX+ speak BLE UART over the Nordic UART Service. These are
// the defaults; a different adapter can pass its own UUIDs to
// BlePlxObdPeripheral. RX (phone -> adapter) is the write characteristic;
// TX (adapter -> phone) is the notify characteristic.
export const OBD_UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const OBD_UART_WRITE_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
export const OBD_UART_NOTIFY_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';
