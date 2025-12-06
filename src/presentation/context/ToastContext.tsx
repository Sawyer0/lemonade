'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

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

        // Cast to NodeJS.Timeout if necessary for the Map, or change Map type. 
        // Ideally, Map should hold numbers for browser environment.
        // But since the ref is defined as Map<string, NodeJS.Timeout>, we should cast or fix ref.
        // Let's fix the usage to match the Ref definition (standard Next.js env usually has NodeJS types global).
        // Actually, in client components, it's better to store 'any' or 'number' if using window.setTimeout.
        // However, user error said "Argument of type 'number' is not assignable to 'Timeout'".
        // This means the Ref expects NodeJS.Timeout (object) but we got number.
        // If we use `setTimeout` (global), it returns Timeout (node) or number (dom).
        // Next.js client component might be picking up @types/node.
        // Safest fix: `as unknown as NodeJS.Timeout`.
        timeoutsRef.current.set(id, timeout as unknown as NodeJS.Timeout);
    }, []);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
            timeoutsRef.current.clear();
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
