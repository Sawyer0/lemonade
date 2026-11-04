'use client';

import { Upload } from 'lucide-react';

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
            // Robust Validation
            const fileType = file.type; // e.g. 'image/jpeg'
            const fileName = file.name.toLowerCase();
            const allowedList = acceptedTypes.split(',').map((t) => t.trim().toLowerCase());

            // Handle "image/*" wildcards, ".pdf" extensions, and exact MIMEs
            const isValid = allowedList.some((pattern) => {
                if (pattern.endsWith('/*')) {
                    const baseType = pattern.split('/')[0]; // 'image', 'video'
                    return fileType.startsWith(baseType + '/');
                }
                if (pattern.startsWith('.')) {
                    return fileName.endsWith(pattern);
                }
                return fileType === pattern;
            });

            if (isValid || acceptedTypes === '*') {
                onFileSelect(file);
            } else {
                alert(`File type not allowed.\nGot: ${fileType || 'unknown'}\nAccepted: ${acceptedTypes}`);
            }
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
            <p className="text-white font-semibold mb-1">Drop file here or click to select</p>
            <p className="text-zinc-400 text-sm mb-3">Video (MP4, MOV, WebM) or Audio (MP3, WAV, M4A)</p>
            <p className="text-zinc-500 text-xs">Max 500MB</p>
        </div>
    );
}
