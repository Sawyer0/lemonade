'use client';

import { X } from 'lucide-react';

interface SelectedFileDisplayProps {
    selectedFile: File;
    onClearSelection: () => void;
    isUploading: boolean;
}

export function SelectedFileDisplay({ selectedFile, onClearSelection, isUploading }: SelectedFileDisplayProps) {
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div className="border border-white/20 rounded-lg p-4 bg-white/5">
            <div className="flex items-center gap-3">
                {selectedFile.type.startsWith('video/') ? (
                    <div className="flex-shrink-0 w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                            />
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                ) : (
                    <div className="flex-shrink-0 w-10 h-10 rounded bg-green-500/20 flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2 1.343-2 3-2z"
                            />
                        </svg>
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{selectedFile.name}</p>
                    <p className="text-zinc-400 text-sm">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                    onClick={onClearSelection}
                    className="flex-shrink-0 p-2 rounded-full hover:bg-white/10 transition-colors"
                    disabled={isUploading}
                >
                    <X className="w-5 h-5 text-zinc-400" />
                </button>
            </div>
        </div>
    );
}
