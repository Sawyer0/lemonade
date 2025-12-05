import React, { useRef } from 'react';

interface InputBarProps {
    input: string;
    setInput: (value: string) => void;
    onSendMessage: (message: string) => void;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    uploading: boolean;
    progress: number;
}

export function InputBar({ input, setInput, onSendMessage, onUpload, uploading, progress }: InputBarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        onSendMessage(input)
            .then(() => setInput(''))
            .catch((error) => {
                // Handle error (show toast, etc.) but keep input
                console.error('Failed to send message:', error);
            });
    };
    return (
        <div className="flex gap-2">
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-zinc-800 text-white w-12 h-12 rounded-full flex items-center justify-center shrink-0 hover:bg-zinc-700 transition-colors"
            >
                {uploading ? (
                    <span className="text-xs font-mono">{Math.round(progress)}%</span>
                ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                )}
            </button>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="video/*"
                onChange={onUpload}
            />

            <form
                className="flex-1 flex gap-2"
                onSubmit={handleSubmit}
            >
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Master Tech..."
                    className="flex-1 bg-zinc-900/90 border border-zinc-700 rounded-full px-6 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                    type="submit"
                    className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center shrink-0 hover:bg-blue-500"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
            </form>
        </div>
    );
}
