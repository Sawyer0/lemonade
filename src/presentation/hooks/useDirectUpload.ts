import { useState } from 'react';

export function useDirectUpload() {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadFile = async (file: File, sessionId: string) => {
        setUploading(true);
        setProgress(0);

        try {
            // 1. Get Signed URL
            const signRes = await fetch('/api/upload/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentType: file.type,
                    sessionId
                }),
            });

            if (!signRes.ok) throw new Error("Failed to get upload permit");
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
                    if (xhr.status === 200) resolve(true);
                    else reject(new Error('Upload failed'));
                };
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.send(file);
            });

            setUploading(false);
            return publicUrl;

        } catch (error) {
            console.error(error);
            setUploading(false);
            throw error;
        }
    };

    return { uploadFile, uploading, progress };
}
