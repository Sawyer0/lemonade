import { adminStorage } from '@lemonade/infrastructure';
import type { StillStore } from './frameStreamHandler';

/**
 * Production still storage: full-resolution stills land in the media bucket
 * under their case, so the case ledger can reference them by gs:// URI.
 */
export function createAdminStillStore(): StillStore {
    return {
        async storeStill(caseId: string, frameId: string, bytes: Uint8Array): Promise<string> {
            const path = `cases/${caseId}/frames/${frameId}.jpg`;
            const file = adminStorage.bucket().file(path);
            await file.save(Buffer.from(bytes), { contentType: 'image/jpeg' });
            return `gs://${file.bucket.name}/${path}`;
        },
    };
}
