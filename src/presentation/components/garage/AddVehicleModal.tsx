'use client';
import { useState, useEffect } from 'react';
import { useVehicleOnboarding } from '@/presentation/hooks/useVehicleOnboarding';
import { useAuth } from '@/presentation/context/AuthContext';
import { Sheet, Page, Navbar, Link as NavbarLink, List, ListInput, Button, Block, BlockTitle } from 'konsta/react';
import { QrCode, X } from 'lucide-react';

export function AddVehicleModal({ onClose }: { onClose: () => void }) {
    const [vinInput, setVinInput] = useState('');
    const [mode, setMode] = useState<'scan' | 'manual'>('scan');
    const { status, submitVin, newVehicle } = useVehicleOnboarding();
    const { user } = useAuth();

    // Listen for Native Scan Result
    useEffect(() => {
        const handleNativeMessage = (event: MessageEvent) => {
            try {
                // Handle different event structures (native vs web)
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.type === 'VIN_SCANNED' && data.vin) {
                    setVinInput(data.vin);
                    // Auto-submit if valid
                    if (data.vin.length === 17) {
                        submitVin(data.vin, user?.uid || '');
                    } else {
                        // If partial/weird scan, switch to manual to let user fix
                        setMode('manual');
                    }
                }
            } catch {
                // Ignore parsing errors
            }
        };

        // Standard web listener
        window.addEventListener('message', handleNativeMessage);
        // React Native specific listener (sometimes attached differently depending on platform version)
        document.addEventListener('message', handleNativeMessage as EventListener);

        return () => {
            window.removeEventListener('message', handleNativeMessage);
            document.removeEventListener('message', handleNativeMessage as EventListener);
        };
    }, [user?.uid, submitVin]);

    const triggerNativeScan = () => {
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCAN_VIN' }));
        } else {
            alert('Scanner only available on mobile app. Please enter manually.');
            setMode('manual');
        }
    };

    const handleManualSubmit = async () => {
        if (user && vinInput) {
            await submitVin(vinInput, user.uid);
        }
    };

    return (
        <Sheet
            className="h-full md:h-auto md:max-h-[80vh] md:w-[600px] md:mx-auto md:rounded-t-2xl pb-safe"
            opened={true}
            onBackdropClick={onClose}
        >
            <Page>
                <Navbar
                    title="Add to Garage"
                    right={
                        <NavbarLink onClick={onClose} iconOnly>
                            <X className="w-6 h-6" />
                        </NavbarLink>
                    }
                />

                {status === 'success' && newVehicle ? (
                    // SUCCESS STATE
                    <Block className="text-center space-y-4 pt-12">
                        <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <BlockTitle className="text-2xl font-bold text-center !text-white !m-0">
                            Vehicle Identified!
                        </BlockTitle>
                        <p className="text-zinc-400 font-mono text-lg">
                            {newVehicle.specs.year} {newVehicle.specs.make} {newVehicle.specs.model}
                        </p>
                        <div className="mt-8 px-4">
                            <Button
                                large
                                raised
                                href={`/session/start?vehicleId=${newVehicle.id}`}
                                className="bg-white !text-black font-bold"
                            >
                                Open Project
                            </Button>
                        </div>
                    </Block>
                ) : (
                    // INPUT STATE
                    <>
                        {mode === 'scan' ? (
                            <div className="flex flex-col h-full pt-10 px-6">
                                <div className="text-center mb-8">
                                    <h3 className="text-2xl font-bold text-white mb-2">Scan VIN Barcode</h3>
                                    <p className="text-zinc-400">
                                        Locate the barcode on your driver&apos;s door jamb or dashboard.
                                    </p>
                                </div>

                                <button
                                    onClick={triggerNativeScan}
                                    className="flex-1 max-h-80 bg-black rounded-3xl border border-white/10 flex flex-col items-center justify-center group active:scale-95 transition-all overflow-hidden relative"
                                >
                                    <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
                                    <div className="relative z-10 p-8 rounded-full bg-zinc-900 border border-white/10 mb-6 group-hover:border-blue-500/50 shadow-2xl">
                                        <QrCode className="w-16 h-16 text-white group-hover:text-blue-400 transition-colors" />
                                    </div>
                                    <span className="relative z-10 text-lg font-bold text-white">Tap to Scan</span>
                                </button>

                                <div className="mt-8 text-center">
                                    <p className="text-zinc-500 mb-4">Scanner not working?</p>
                                    <Button
                                        tonal
                                        onClick={() => setMode('manual')}
                                        className="bg-zinc-800 text-zinc-300"
                                    >
                                        Enter VIN Manually
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="pt-6">
                                <BlockTitle>Manual Entry</BlockTitle>
                                <List strong inset>
                                    <ListInput
                                        label="VIN Number"
                                        type="text"
                                        placeholder="Type 17-digit VIN..."
                                        value={vinInput}
                                        onChange={(e) => setVinInput(e.target.value.toUpperCase())}
                                        info="Found on dashboard or door jamb"
                                        clearButton
                                        maxLength={17}
                                    />
                                </List>

                                <Block className="grid grid-cols-1 gap-4">
                                    <Button
                                        large
                                        raised
                                        onClick={handleManualSubmit}
                                        disabled={status === 'processing' || vinInput.length < 17}
                                        className={status === 'processing' ? 'opacity-50' : ''}
                                    >
                                        {status === 'processing' ? 'Decoding DNA...' : 'Decode VIN'}
                                    </Button>

                                    <Button clear onClick={() => setMode('scan')} className="mt-2">
                                        Back to Scanner
                                    </Button>
                                </Block>
                            </div>
                        )}
                    </>
                )}
            </Page>
        </Sheet>
    );
}
