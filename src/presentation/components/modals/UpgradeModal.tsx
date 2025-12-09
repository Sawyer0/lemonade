'use client';
import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Zap, X, Loader2, Check } from 'lucide-react';
import { Sheet, Page, Navbar, Link, Block, Button, List, ListItem } from 'konsta/react';

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
            const createCheckoutSession = httpsCallable<Record<string, unknown>, { url: string }>(functions, 'createCheckoutSession');
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

    return (
        <Sheet
            className="h-full md:h-auto md:max-h-[80vh] md:w-[600px] md:mx-auto md:rounded-t-2xl pb-safe"
            opened={isOpen}
            onBackdropClick={onClose}
        >
            <Page>
                <Navbar
                    title="Unlock Pro"
                    right={
                        <Link onClick={onClose} iconOnly>
                            <X className="w-6 h-6" />
                        </Link>
                    }
                />

                <Block className="text-center space-y-4 pt-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/30">
                        <Zap className="w-10 h-10 text-yellow-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1">Upgrade to Pro</h2>
                        <p className="text-zinc-400">Unlock unlimited AI power for your garage</p>
                    </div>
                </Block>

                <List strong inset className="!bg-zinc-900/50 border border-zinc-800">
                    {[
                        'Unlimited Video Analysis',
                        'Real-time Voice Commands',
                        'Priority AI Processing',
                        'Advanced Safety Verification',
                    ].map((feature) => (
                        <ListItem
                            key={feature}
                            title={feature}
                            media={
                                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-3 h-3 text-green-400" />
                                </div>
                            }
                        />
                    ))}
                </List>

                <Block className="space-y-4">
                    <div className="flex items-baseline justify-center gap-1 py-4">
                        <span className="text-4xl font-bold text-white">$20</span>
                        <span className="text-zinc-500">/month</span>
                    </div>

                    <Button
                        large
                        raised
                        onClick={handleUpgrade}
                        disabled={loading}
                        className="bg-gradient-to-r from-yellow-500 to-orange-500 !text-black font-bold h-14 !rounded-2xl"
                    >
                        {loading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            'Upgrade Now'
                        )}
                    </Button>
                    <p className="text-center text-xs text-zinc-500">
                        Cancel anytime. Secure checkout via Stripe.
                    </p>
                </Block>
            </Page>
        </Sheet>
    );
}
