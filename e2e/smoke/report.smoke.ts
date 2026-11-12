import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SMOKE_PORT } from './globalSetup';

/**
 * LM-06 smoke: the one-page case report renders on web, and its API route
 * is auth-guarded. Report content itself is covered by the unit snapshot
 * (buildReport.test.ts) and the route tests; this file proves the page
 * serves over the real production server.
 */
const BASE = `http://127.0.0.1:${SMOKE_PORT}`;
const caseId = '123e4567-e89b-12d3-a456-426614174000';

describe('case report', () => {
    it('renders the report page', async () => {
        const res = await fetch(`${BASE}/case/${randomUUID()}/report`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Case report');
        expect(html).toContain('Save as PDF');
    });

    it('answers 401 for the report API without a token', async () => {
        const res = await fetch(`${BASE}/api/cases/${caseId}/report`);
        expect(res.status).toBe(401);
    });
});
