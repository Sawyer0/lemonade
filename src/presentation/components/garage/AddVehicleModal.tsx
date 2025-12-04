'use client';
import { useState } from 'react';
import { useVehicleOnboarding } from '@/presentation/hooks/useVehicleOnboarding';
import { useAuth } from '@/presentation/context/AuthContext';

export function AddVehicleModal({ onClose }: { onClose: () => void }) {
    const [vinInput, setVinInput] = useState('');
    const { status, submitVin, newVehicle } = useVehicleOnboarding();
    const { user } = useAuth();

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (user) {
            await submitVin(vinInput, user.uid);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl">

                {/* HEADER */}
                <div className="p-6 border-b border-zinc-800">
                    <h3 className="text-xl font-bold text-white">Add to Garage</h3>
                    <p className="text-zinc-400 text-sm">Scan VIN barcode or enter manually</p>
                </div>

                {/* BODY */}
                <div className="p-6">
                    {status === 'success' && newVehicle ? (
                        // SUCCESS STATE
                        <div className="text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <h4 className="text-white text-lg font-bold">Vehicle Identified!</h4>
                            <p className="text-zinc-300 font-mono mt-2">
                                {newVehicle.specs.year} {newVehicle.specs.make} {newVehicle.specs.model}
                            </p>
                            <div className="mt-6">
                                <button onClick={onClose} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200">
                                    Open Project
                                </button>
                            </div>
                        </div>
                    ) : (
                        // INPUT STATE
                        <form onSubmit={handleScan} className="space-y-4">
                            <div className="relative">
                                <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50 animate-scan" />

                                <input
                                    type="text"
                                    value={vinInput}
                                    onChange={(e) => setVinInput(e.target.value.toUpperCase())}
                                    placeholder="Scan or Type VIN..."
                                    className="w-full bg-zinc-950 border border-zinc-700 text-white font-mono text-center text-lg py-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    maxLength={17}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={status === 'processing'}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {status === 'processing' ? 'Decoding DNA...' : 'Decode VIN'}
                            </button>
                        </form>
                    )}
                </div>

                {/* FOOTER */}
                {status !== 'success' && (
                    <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-center">
                        <button onClick={onClose} className="text-zinc-500 text-sm hover:text-white">Cancel</button>
                    </div>
                )}
            </div>
        </div>
    );
}
