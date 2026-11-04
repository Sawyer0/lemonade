import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import { CameraView, BarcodeScanningResult } from 'expo-camera';
import { X } from 'lucide-react-native';
import { Theme } from '@mobile/constants/theme';
import { GlassCard } from './ui/GlassCard.native';

interface VinScannerProps {
    onScan: (vin: string) => void;
    onClose: () => void;
}

export function VinScanner({ onScan, onClose }: VinScannerProps) {
    const [scanned, setScanned] = useState(false);

    const handleBarCodeScanned = (result: BarcodeScanningResult) => {
        if (scanned) return;

        // VINs are typically CODE_39 or simple text in QR/DataMatrix
        // Basic validation: 17 chars
        const raw = result.data;
        if (raw && raw.length >= 17) {
            // Simple heuristic to clear non-alphanumeric if needed,
            // but usually raw barcode is clean.
            // Take the last 17 characters if longer (sometimes prefixed)
            const vin = raw.substring(raw.length - 17);

            setScanned(true);
            onScan(vin);
        }
    };

    return (
        <View style={styles.container}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                barcodeScannerSettings={{
                    barcodeTypes: ['qr', 'code39', 'code128', 'datamatrix'],
                }}
            />

            <View style={styles.overlay}>
                <View style={styles.header}>
                    <Text style={styles.title}>Scan VIN</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <GlassCard variant="thin">
                            <X color="white" size={24} />
                        </GlassCard>
                    </TouchableOpacity>
                </View>

                <View style={styles.viewportContainer}>
                    <View style={styles.viewport} />
                    <Text style={styles.hintText}>Align barcode within frame</Text>
                </View>
            </View>
        </View>
    );
}

const { width } = Dimensions.get('window');
const viewportSize = width * 0.8;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        padding: 20,
        paddingTop: 60,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
    },
    closeButton: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    viewportContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    viewport: {
        width: viewportSize,
        height: viewportSize * 0.6, // Rectangular for barcodes
        borderWidth: 2,
        borderColor: Theme.tint,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    hintText: {
        color: 'rgba(255,255,255,0.8)',
        marginTop: 20,
        fontSize: 16,
    },
});
