import { useState } from 'react';

import { auth } from '@/infrastructure/firebase/config';
import { AppError, ErrorCode } from '@lemonade/core';



export function useDirectUpload() {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadFile = async (file: File, sessionId: string) => {
        setUploading(true);
        setProgress(0);

        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new AppError(ErrorCode.UNAUTHORIZED, "User not authenticated");

            // 1. Get Signed URL
            const signRes = await fetch('/api/upload/sign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    contentType: file.type,
                    sessionId
                }),
            });

            if (!signRes.ok) {
                const errorText = await signRes.text().catch(() => 'No details');
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, `Failed to get upload permit: ${signRes.status} ${signRes.statusText} - ${errorText}`);
            }
            const { uploadUrl, publicUrl } = await signRes.json();

            // 2. Upload to GCS (Directly)
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl, true);
            xhr.setRequestHeader('Content-Type', file.type);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    setProgress((e.loaded / e.total) * 100);
                }
            };

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        // logger.info('[useDirectUpload] Upload success', { status: xhr.status });
                        resolve(true);
                    } else {
                        // const logger = clientContainer.get<ILogger>(TYPES.Logger);
                        const uploadError = new AppError(ErrorCode.INTERNAL_SERVER_ERROR, `Upload failed with status ${xhr.status}`);
                        console.error('[useDirectUpload] XHR Failed', uploadError, { status: xhr.status, response: xhr.response });
                        reject(uploadError);
                    }
                };
                xhr.onerror = () => {
                    // const logger = clientContainer.get<ILogger>(TYPES.Logger);
                    const networkError = new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Network error - Check CORS/Tunnel');
                    console.error('[useDirectUpload] Network Error (CORS?)', networkError, { status: xhr.status, readyState: xhr.readyState });
                    reject(networkError);
                };
                xhr.send(file);
            });

            setUploading(false);
            return publicUrl;

        } catch (error) {
            console.error('Upload failed', error);
            setUploading(false);
            throw error;
        }
    };

    return { uploadFile, uploading, progress };
}
