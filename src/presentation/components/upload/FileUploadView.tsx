'use client';

import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { useToast } from '@/presentation/context';
import { clsx } from 'clsx';

interface FileUploadViewProps {
	onUpload: (file: File) => Promise<void>;
	onClose: () => void;
	acceptedTypes?: string;
}

export function FileUploadView({
	onUpload,
	onClose,
	acceptedTypes = 'video/*,audio/*',
}: FileUploadViewProps) {
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

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();

		const file = e.dataTransfer.files?.[0];
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
			console.error('Upload error:', error);
			showToast('Failed to upload file', 'error');
		} finally {
			setIsUploading(false);
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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
				{/* Drop Zone */}
				{!selectedFile ? (
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
				) : (
					/* Selected File Display */
					<div className="border border-white/20 rounded-lg p-4 bg-white/5">
						<div className="flex items-center gap-3">
							{selectedFile.type.startsWith('video/') ? (
								<div className="flex-shrink-0 w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">
									<svg
										className="w-6 h-6 text-blue-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
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
									<svg
										className="w-6 h-6 text-green-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
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
								<p className="text-white font-semibold truncate">
									{selectedFile.name}
								</p>
								<p className="text-zinc-400 text-sm">
									{formatFileSize(selectedFile.size)}
								</p>
							</div>
							<button
								onClick={() => setSelectedFile(null)}
								className="flex-shrink-0 p-2 rounded-full hover:bg-white/10 transition-colors"
								disabled={isUploading}
							>
								<X className="w-5 h-5 text-zinc-400" />
							</button>
						</div>
					</div>
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
								: 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
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
