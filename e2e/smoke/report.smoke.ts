import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SMOKE_PORT } from './globalSetup';

/**
 * LM-06 smoke: the one-page case report renders on web, and its API route
 * is auth-guarded. The page is a server component, so a raw-HTML fetch sees
 * the report chrome and the signed-out state the server renders for an
 * unauthenticated request — the report body itself loads client-side with
 * the signed-in owner's token (there is no session cookie for the server
 * to read), so no report content is ever rendered for a stranger. Report
 * content itself is covered by the unit snapshot (buildReport.test.ts),
 * the route tests, and the CaseReportView component test, which renders
 * the closed golden case.
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
        // Server-rendered page content, not just the shell: an
        // unauthenticated fetch gets the signed-out state, and no report
        // section is ever rendered for a case the requester does not own.
        expect(html).toContain('Sign in to view this report');
        expect(html).not.toContain('Loading report');
    });

    it('answers 401 for the report API without a token', async () => {
        const res = await fetch(`${BASE}/api/cases/${caseId}/report`);
        expect(res.status).toBe(401);
    });
});
