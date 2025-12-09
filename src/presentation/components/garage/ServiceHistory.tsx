/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { db } from '@/infrastructure/firebase/config';
import { deleteDoc, doc } from 'firebase/firestore';
import { Page, Navbar, List, ListItem, Link, NavbarBackLink } from 'konsta/react';
import { Trash2 } from 'lucide-react';
import { motion, AnimatePresence, PanInfo, useAnimation } from 'framer-motion';

interface ServiceHistoryProps {
    sessions: DiagnosticSession[];
    vehicleId?: string;
}

// 1. Swipeable Wrapper for Konsta ListItem
const SwipeableKonstaItem = ({
    session,
    onDelete,
    onClick
}: {
    session: DiagnosticSession;
    onDelete: (id: string) => void;
    onClick: () => void;
}) => {
    const controls = useAnimation();

    // Name Logic:
    // 1. AI Diagnosis
    // 2. User Complaint (if not generic "New Session")
    // 3. Fallback to Date or "Untitled"
    let title = session.aiAnalysis?.diagnosis;

    if (!title) {
        if (session.complaint && session.complaint !== "New Session") {
            title = session.complaint;
        } else {
            title = session.updatedAt
                ? new Date(session.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })
                : "Untitled Diagnosis";
        }
    }

    const handleDragEnd = async (_: unknown, info: PanInfo) => {
        const offset = info.offset.x;
        const velocity = info.velocity.x;

        // Swipe Left to Delete threshold
        if (offset < -100 || velocity < -500) {
            await controls.start({ x: -1000, opacity: 0, transition: { duration: 0.2 } });
            onDelete(session.id);
        } else {
            // Snap back
            controls.start({ x: 0, opacity: 1 });
        }
    };

    return (
        <div className="relative overflow-hidden bg-black">
            {/* Background Layer (Delete Action) */}
            <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-6">
                <Trash2 className="text-white w-6 h-6" />
            </div>

            {/* Foreground Layer (Konsta Item) */}
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0.1, right: 0.1 }}
                onDragEnd={handleDragEnd}
                animate={controls}
                className="relative bg-black"
                style={{ touchAction: 'pan-y' }}
            >
                <ListItem
                    link
                    chevron
                    title={<span className="text-white font-medium">{title}</span>}
                    onClick={onClick}
                    // Force dark theme colors to ensure visibility against black page
                    className="!bg-zinc-900 active:!bg-zinc-800"
                />
            </motion.div>
        </div>
    );
};

// 2. Skeleton Loader (Matches List Item height)
const HistorySkeleton = () => (
    <div className="space-y-4 px-4 pt-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-zinc-900 rounded-lg w-full"></div>
        ))}
    </div>
);

// --- MAIN COMPONENT ---

export function ServiceHistory({ sessions }: ServiceHistoryProps) {
    const [items, setItems] = useState<DiagnosticSession[]>(sessions || []);
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleDelete = async (sessionId: string) => {
        const originalItems = [...items];
        setItems((prev) => prev.filter((s) => s.id !== sessionId));

        try {
            await deleteDoc(doc(db, 'sessions', sessionId));
        } catch (err) {
            console.error(err);
            setItems(originalItems);
        }
    };

    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return dateB - dateA;
        });
    }, [items]);

    return (
        <Page className="!bg-black">
            {/* Official Konsta Navbar with Transparency */}
            <Navbar
                transparent
                title="History"
                left={
                    <NavbarBackLink onClick={() => router.back()} text="" />
                }
            />

            <div className="relative min-h-screen">
                {isLoading ? (
                    <HistorySkeleton />
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center pt-32 px-10 text-center opacity-60">
                        <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4">
                            <span className="text-3xl">💬</span>
                        </div>
                        <h3 className="text-white font-medium text-lg mb-1">No History Yet</h3>
                        <p className="text-zinc-500 text-sm">Start a new diagnosis to see it here.</p>
                    </div>
                ) : (
                    <List strong inset className="!m-0 !bg-transparent">
                        <AnimatePresence initial={false}>
                            {sortedItems.map((session) => (
                                <SwipeableKonstaItem
                                    key={session.id}
                                    session={session}
                                    onDelete={handleDelete}
                                    onClick={() => router.push(`/session/${session.id}`)}
                                />
                            ))}
                        </AnimatePresence>
                    </List>
                )}
            </div>
        </Page>
    );
}
