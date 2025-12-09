'use client';

import { Upload } from 'lucide-react';
import { clsx } from 'clsx';

interface FileDropZoneProps {
    onFileSelect: (file: File) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    acceptedTypes: string;
}

export function FileDropZone({ onFileSelect, fileInputRef, acceptedTypes }: FileDropZoneProps) {
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const file = e.dataTransfer.files?.[0];
        if (file) {
            onFileSelect(file);
        }
    };

    return (
        <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center hover:border-white/40 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
        >
            <Upload className="w-12 h-12 mx-auto mb-3 text-zinc-400" />
            <p className="text-white font-semibold mb-1">
                Drop file here or click to select
            </p>
            <p className="text-zinc-400 text-sm mb-3">
                Video (MP4, MOV, WebM) or Audio (MP3, WAV, M4A)
            </p>
            <p className="text-zinc-500 text-xs">Max 500MB</p>
        </div>
    );
}
