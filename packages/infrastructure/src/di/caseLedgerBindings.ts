import { Container } from 'inversify';
import { Pool } from 'pg';
import type { ICaseRepository, LedgerHasher } from '@lemonade/core';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import { TYPES } from './types';
import { PostgresCaseRepository } from '../repositories/PostgresCaseRepository';
import { NodeCryptoLedgerHasher } from '../crypto/NodeCryptoLedgerHasher';

/**
 * Binds the case ledger (Postgres). The pool is lazy: it opens no connection
 * until the first query. An unset LEMONADE_CASE_LEDGER_DATABASE_URL fails
 * fast with a clear error the first time the pool is resolved — never a
 * silent connection to whatever the host's PG* environment points at.
 * Shared by the infrastructure container and the web container so the
 * bindings cannot drift apart.
 */
export function bindCaseLedger(container: Container): void {
    container
        .bind<Pool>(TYPES.PostgresPool)
        .toDynamicValue((context) => {
            const configProvider = context.get<IConfigProvider>(TYPES.ConfigProvider);
            const connectionString = configProvider.getCaseLedgerConfig().connectionString;
            if (!connectionString) {
                throw new Error(
                    'LEMONADE_CASE_LEDGER_DATABASE_URL is not set; the case ledger needs a Postgres database',
                );
            }
            return new Pool({ connectionString });
        })
        .inSingletonScope();
    container.bind<LedgerHasher>(TYPES.LedgerHasher).to(NodeCryptoLedgerHasher).inSingletonScope();
    container.bind<ICaseRepository>(TYPES.CaseRepo).to(PostgresCaseRepository).inSingletonScope();
}
