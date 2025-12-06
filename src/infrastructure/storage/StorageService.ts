import { injectable } from 'inversify';
import { Storage } from '@google-cloud/storage';

@injectable()
export class StorageService {
    private bucket;

    constructor(projectId: string, bucketName: string) {
        const storageOptions: { projectId: string; credentials?: { client_email: string; private_key: string } } = { projectId };

        // Use Service Account from Env if available (Development/Production)
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                storageOptions.credentials = {
                    client_email: credentials.client_email,
                    private_key: credentials.private_key,
                };
            } catch (error) {
                console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY", error);
            }
        }

        const storage = new Storage(storageOptions);
        this.bucket = storage.bucket(bucketName);
    }

    async generateSignedUrl(filename: string, contentType: string): Promise<{ uploadUrl: string, publicUrl: string }> {
        const file = this.bucket.file(filename);

        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType,
        });

        return {
            uploadUrl: url,
            publicUrl: `gs://${this.bucket.name}/${filename}`
        };
    }
}
