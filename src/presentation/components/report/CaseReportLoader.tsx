'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CaseReport } from '@lemonade/core';
import { CaseReportResponseSchema } from '@/application/dtos/case.dto';
import { useAuth } from '@/presentation/context';
import { CaseReportView } from '@/presentation/components/report/CaseReportView';

// LM-06: the interactive half of the report page. The server page renders
// this component's first paint — header, Save as PDF button, and the
// signed-out notice while auth is unresolved — so the report chrome is in
// the SSR HTML. Once the user is known, the report is fetched with their
// Firebase token from GET /api/cases/[caseId]/report, built server-side
// straight from the ledger; "Save as PDF" opens the browser print dialog
// with the app chrome stripped by the print stylesheet.
export function CaseReportLoader({ caseId }: { caseId: string }) {
    const { user, loading: authLoading } = useAuth();
    const [report, setReport] = useState<CaseReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadReport = useCallback(async () => {
        if (!user) {
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/cases/${caseId}/report`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? `Report load failed (${response.status})`);
            }
            const parsed = CaseReportResponseSchema.parse(await response.json());
            setReport(parsed.data);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Report load failed');
        } finally {
            setLoading(false);
        }
    }, [caseId, user]);

    useEffect(() => {
        if (user) {
            void loadReport();
        }
    }, [user, loadReport]);

    const header = (
        <header className="print:hidden px-4 pt-4 pb-2 flex items-center justify-between">
            <h1 className="text-lg font-bold">Case report</h1>
            <button
                type="button"
                onClick={() => window.print()}
                disabled={!report}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
                Save as PDF
            </button>
        </header>
    );

    // Until auth resolves, and when there is no signed-in user, the page
    // shows the signed-out state — this is also the first paint the server
    // renders, so it must match the server render exactly.
    if (authLoading || !user) {
        return (
            <>
                {header}
                <p className="px-4 py-8 text-zinc-500 text-sm">Sign in to view this report</p>
            </>
        );
    }
    if (loading) {
        return (
            <>
                {header}
                <p className="px-4 py-8 text-zinc-500 text-sm">Loading report…</p>
            </>
        );
    }
    if (loadError || !report) {
        return (
            <>
                {header}
                <div className="px-4 py-8">
                    <p className="text-red-400 text-sm">{loadError ?? 'Report could not be loaded'}</p>
                    <button
                        type="button"
                        onClick={() => void loadReport()}
                        className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                    >
                        Retry
                    </button>
                </div>
            </>
        );
    }
    return (
        <>
            {header}
            <CaseReportView report={report} />
        </>
    );
}
