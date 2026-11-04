'use client';

import { useState, useRef } from 'react';

import { X, Loader2, Upload } from 'lucide-react';
import { useToast } from '@/presentation/context';
import { clsx } from 'clsx';
import { FileDropZone } from './FileDropZone';
import { SelectedFileDisplay } from './SelectedFileDisplay';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { ILogger } from '@lemonade/core';

interface FileUploadViewProps {
    onUpload: (file: File) => Promise<void>;
    onClose: () => void;
    acceptedTypes?: string;
}

export function FileUploadView({ onUpload, onClose, acceptedTypes = 'video/*,audio/*' }: FileUploadViewProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const { showToast } = useToast();

    const handleFileSelect = (file: File) => {
        // Validate file type
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');

        if (!isVideo && !isAudio) {
            showToast('Please select a video or audio file', 'error');
            return;
        }

        // Validate file size (max 500MB)
        const maxSize = 500 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('File too large. Maximum size is 500MB', 'error');
            return;
        }

        setSelectedFile(file);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.currentTarget.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            showToast('Please select a file', 'error');
            return;
        }

        setIsUploading(true);
        try {
            await onUpload(selectedFile);
            onClose();
        } catch (error) {
            const logger = clientContainer.get<ILogger>(TYPES.Logger);
            logger.error('Upload error:', error);
            showToast('Failed to upload file', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="relative w-full bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl my-2 p-6">
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors z-10"
            >
                <X className="w-5 h-5" />
            </button>

            {/* Main Content */}
            <div className="space-y-4">
                {selectedFile ? (
                    <SelectedFileDisplay
                        selectedFile={selectedFile}
                        onClearSelection={() => setSelectedFile(null)}
                        isUploading={isUploading}
                    />
                ) : (
                    <FileDropZone
                        onFileSelect={handleFileSelect}
                        fileInputRef={fileInputRef}
                        acceptedTypes={acceptedTypes}
                    />
                )}

                {/* Hidden File Input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleInputChange}
                    accept={acceptedTypes}
                    className="hidden"
                />

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="flex-1 px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || isUploading}
                        className={clsx(
                            'flex-1 px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors',
                            selectedFile && !isUploading
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed',
                        )}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Analyze File
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
