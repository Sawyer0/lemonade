'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { AppError, ErrorCode } from '@lemonade/core';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        // Auto-dismiss
        // Use window.setTimeout to ensure return type is number (browser API)
        const timeout = window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
            timeoutsRef.current.delete(id);
        }, 3000);

        // Store timeout ID for cleanup
        timeoutsRef.current.set(id, timeout as unknown as NodeJS.Timeout);
    }, []);

    // Cleanup timeouts on unmount
    useEffect(() => {
        const timeouts = timeoutsRef.current;
        return () => {
            timeouts.forEach((timeout) => clearTimeout(timeout));
            timeouts.clear();
        };
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={clsx(
                            "px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium animate-in slide-in-from-bottom-2 pointer-events-auto transition-all",
                            {
                                'bg-green-600': toast.type === 'success',
                                'bg-red-600': toast.type === 'error',
                                'bg-blue-600': toast.type === 'info',
                            }
                        )}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'useToast must be used within a ToastProvider');
    }
    return context;
}

