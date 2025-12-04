import { injectable } from 'inversify';
import { Storage } from '@google-cloud/storage';

@injectable()
export class StorageService {
    private bucket;

    constructor(projectId: string, bucketName: string) {
        const storage = new Storage({ projectId });
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
