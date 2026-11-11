// OBD-II capture on mobile (LM-03): BLE UART transport for the M1 adapter
// (OBDLink CX / MX+), plus the adapter that plugs it into the core capture
// service. Wi-Fi and Android adapters implement ObdBlePeripheral's sibling
// interfaces later; the capture service never sees the difference.
import { BleManager } from 'react-native-ble-plx';
import { BleObdAdapter } from './BleObdAdapter';
import { BlePlxObdPeripheral } from './BlePlxObdPeripheral';
import type { ScannedObdAdapter } from './ObdBlePeripheral';

export * from './ObdBlePeripheral';
export * from './BleObdTransport';
export * from './BlePlxObdPeripheral';
export * from './BleObdAdapter';

/** Builds a BLE adapter for one scanned device, over the Nordic UART Service. */
export function createBleObdAdapter(manager: BleManager, device: ScannedObdAdapter): BleObdAdapter {
    return new BleObdAdapter(new BlePlxObdPeripheral(manager), device.id, device.name);
}
