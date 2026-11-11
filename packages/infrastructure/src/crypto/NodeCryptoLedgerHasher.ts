import { createHash } from 'node:crypto';
import { injectable } from 'inversify';
import type { LedgerHasher } from '@lemonade/core';

// Node's SHA-256 for the ledger hash chain. Core stays free of Node-only
// imports (the mobile app imports it too), so the digest lives here and is
// injected into the repository as a LedgerHasher.
@injectable()
export class NodeCryptoLedgerHasher implements LedgerHasher {
    digestHex(data: string): string {
        return createHash('sha256').update(data, 'utf8').digest('hex');
    }
}
