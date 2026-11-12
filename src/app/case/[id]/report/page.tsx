'use client';
import { use, useCallback, useEffect, useState } from 'react';
import type { CaseReport } from '@lemonade/core';
import { CaseReportResponseSchema } from '@/application/dtos/case.dto';
import { useAuth } from '@/presentation/context';
import { CaseReportView } from '@/presentation/components/report/CaseReportView';

// LM-06: the one-page case report, viewable on web and shareable as PDF.
// The report JSON comes from GET /api/cases/[caseId]/report, built
// server-side straight from the ledger; this page only renders it. "Save
// as PDF" opens the browser print dialog — the print stylesheet below
// strips the app chrome so the printed page is the report alone.
export default function CaseReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading: authLoading } = useAuth();
    const [token, setToken] = useState<string | null>(null);
    const [report, setReport] = useState<CaseReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setToken(null);
            setLoading(false);
            return;
        }
        user.getIdToken()
            .then(setToken)
            .catch(() => setToken(null));
    }, [user]);

    const loadReport = useCallback(async () => {
        if (!token) {
            return;
        }
        setLoading(true);
        setLoadError(null);
        try {
            const response = await fetch(`/api/cases/${id}/report`, {
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
    }, [id, token]);

    useEffect(() => {
        void loadReport();
    }, [loadReport]);

    return (
        <div className="min-h-screen bg-black text-white">
            <style>{`@media print { body { background: white !important; } }`}</style>
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
            {authLoading || loading ? (
                <p className="px-4 py-8 text-zinc-500 text-sm">Loading report…</p>
            ) : loadError || !report ? (
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
            ) : (
                <CaseReportView report={report} />
            )}
        </div>
    );
}
