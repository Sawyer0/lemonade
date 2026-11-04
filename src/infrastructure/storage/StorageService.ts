import { injectable } from 'inversify';
import type { ILogger } from '@lemonade/core';
import { Storage } from '@google-cloud/storage';
import { CONFIG } from '@/infrastructure/config';

@injectable()
export class StorageService {
    private bucket;
    private logger?: ILogger; // Optional for now to avoid breaking tests if manually instantiated

    constructor(projectId: string, bucketName: string, logger?: ILogger) {
        this.logger = logger;
        const storageOptions: { projectId: string; credentials?: { client_email: string; private_key: string } } = {
            projectId,
        };

        // Use Service Account from Env if available (Development/Production)
        const serviceAccount = CONFIG.FIREBASE.SERVICE_ACCOUNT;
        if (serviceAccount) {
            storageOptions.credentials = {
                client_email: serviceAccount.client_email,
                private_key: serviceAccount.private_key,
            };
        }

        const storage = new Storage(storageOptions);
        this.bucket = storage.bucket(bucketName);
    }

    async generateSignedUrl(filename: string, contentType: string): Promise<{ uploadUrl: string; publicUrl: string }> {
        const file = this.bucket.file(filename);

        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType,
        });

        return {
            uploadUrl: url,
            publicUrl: `gs://${this.bucket.name}/${filename}`,
        };
    }
}
