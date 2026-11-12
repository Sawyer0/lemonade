import { CaseReportLoader } from '@/presentation/components/report/CaseReportLoader';

// LM-06: the one-page case report, viewable on web and shareable as PDF.
// This page is a server component on purpose: it awaits `params` here, so
// the page server-renders its chrome and its signed-out state instead of
// suspending on `use(params)` and streaming only a Suspense shell (which a
// raw-HTML fetch could never see the header in). The report body itself
// still loads in the client loader after hydration: the server has no user
// identity at page-request time — Firebase auth lives client-side and this
// app sets no session cookie — and the report is owner-scoped, so fetching
// it server-side without the signed-in user's token would bypass the
// ownership check the API route enforces.
export default async function CaseReportPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div className="min-h-screen bg-black text-white">
            <style>{`@media print { body { background: white !important; } }`}</style>
            <CaseReportLoader caseId={id} />
        </div>
    );
}
