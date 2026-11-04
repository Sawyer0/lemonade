import { useState } from 'react';
import { storage } from '@mobile/infrastructure/firebase/config';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface UploadResult {
    downloadUrl: string;
    gsUri: string; // Added for Vertex AI compatibility
    metadata: {
        contentType: string;
        size: number;
        path: string;
    };
}

export function useChatUploads(sessionId: string) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const uploadFile = async (uri: string, type: 'image' | 'video'): Promise<UploadResult> => {
        setUploading(true);
        setProgress(0);
        setError(null);

        try {
            // 1. Prepare File
            const response = await fetch(uri);
            const blob = await response.blob();

            // 2. Generate Path
            const ext = type === 'image' ? 'jpg' : 'mp4';
            const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const storagePath = `sessions/${sessionId}/uploads/${filename}`;
            const storageRef = ref(storage, storagePath);

            // Construct GS URI
            const bucket = storage.app.options.storageBucket;
            const gsUri = `gs://${bucket}/${storagePath}`;

            // 3. Upload
            const uploadTask = uploadBytesResumable(storageRef, blob);

            return new Promise((resolve, reject) => {
                uploadTask.on(
                    'state_changed',
                    (snapshot) => {
                        const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setProgress(p);
                    },
                    (error) => {
                        console.error('Upload failed:', error);
                        setError(error.message);
                        setUploading(false);
                        reject(error);
                    },
                    async () => {
                        // 4. Success
                        try {
                            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                            setUploading(false);
                            resolve({
                                downloadUrl,
                                gsUri, // Pass the GCS URI
                                metadata: {
                                    contentType: blob.type,
                                    size: blob.size,
                                    path: storagePath,
                                },
                            });
                        } catch (e: unknown) {
                            const errorMsg = e instanceof Error ? e.message : 'Unknown download URL error';
                            setError(errorMsg);
                            setUploading(false);
                            reject(e);
                        }
                    },
                );
            });
        } catch (err: unknown) {
            console.error('File preparation failed:', err);
            const errorMsg = err instanceof Error ? err.message : 'Unknown upload preparation error';
            setError(errorMsg);
            setUploading(false);
            throw err;
        }
    };

    return { uploadFile, uploading, progress, error };
}
