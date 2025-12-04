'use client';
import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Zap, X, Loader2 } from 'lucide-react';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
    const [loading, setLoading] = useState(false);

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            const functions = getFunctions();
            const createCheckoutSession = httpsCallable<{}, { url: string }>(functions, 'createCheckoutSession');
            const result = await createCheckoutSession({});

            if (result.data.url) {
                window.location.href = result.data.url;
            } else {
                console.error('Checkout error: No URL returned');
                setLoading(false);
            }
        } catch (error) {
            console.error('Checkout error:', error);
            setLoading(false);
        }
    };
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="p-6 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-b border-zinc-800">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-yellow-500/20 rounded-xl">
                            <Zap className="w-6 h-6 text-yellow-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Upgrade to Pro</h2>
                    </div>
                    <p className="text-zinc-400">Unlock unlimited AI diagnostics</p>
                </div>

                {/* Features */}
                <div className="p-6 space-y-4">
                    <ul className="space-y-3">
                        {[
                            'Unlimited Video Analysis',
                            'Real-time Voice Commands',
                            'Priority AI Processing',
                            'Advanced Safety Verification',
                        ].map((feature) => (
                            <li key={feature} className="flex items-center gap-3 text-zinc-300">
                                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <span className="text-green-400 text-xs">✓</span>
                                </div>
                                {feature}
                            </li>
                        ))}
                    </ul>

                    {/* Price */}
                    <div className="pt-4 border-t border-zinc-800">
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold text-white">$20</span>
                            <span className="text-zinc-500">/month</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">Cancel anytime</p>
                    </div>
                </div>

                {/* CTA */}
                <div className="p-6 pt-0">
                    <button
                        onClick={handleUpgrade}
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-black font-bold rounded-xl hover:from-yellow-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Redirecting to Checkout...
                            </>
                        ) : (
                            <>
                                <Zap className="w-5 h-5" />
                                Upgrade Now
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
