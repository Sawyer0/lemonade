// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseReportView } from '../CaseReportView';
import { buildClosedGoldenReport } from '../../../../../packages/core/src/report/__tests__/goldenReport';

/**
 * LM-06: the closed golden case renders as a one-page report — every
 * section the ledger proves, with the citation of the ledger entry each
 * line came from. This is the render-path proof the smoke test cannot give
 * on its own: the smoke server has no case ledger, so it can only prove
 * the page serves and server-renders; this test proves a closed case's
 * report actually renders to its sections and citations.
 */
describe('CaseReportView', () => {
    it('renders every section of the closed golden case with citations', () => {
        const { report } = buildClosedGoldenReport();
        render(<CaseReportView report={report} />);

        expect(screen.getByText(/closed · 11 ledger entries/)).toBeTruthy();
        for (const section of [
            'Vehicle',
            'Complaint',
            'Codes',
            'Evidence',
            'Differential',
            'Tests run',
            'Repair',
            'Outcome',
        ]) {
            expect(screen.getByRole('heading', { name: section })).toBeTruthy();
        }
        expect(screen.queryByRole('heading', { name: 'Corrections' })).toBeNull();

        expect(screen.getByText(/2003 Honda Accord · VIN 1HGCM82633A004352/)).toBeTruthy();
        // The complaint text appears twice: as the Complaint section and as
        // the observation in Evidence.
        expect(screen.getAllByText(/Misfire on cylinder 1 at idle/)).toHaveLength(2);
        expect(screen.getByText(/P0300 \(read\)/)).toBeTruthy();
        expect(screen.getByText(/Frame gs:\/\/lemonade-demo\/frames\/frame-001\.jpg/)).toBeTruthy();
        expect(screen.getByText(/Head gasket leak — 80%/)).toBeTruthy();
        expect(screen.getByText(/Ignition coil failure — 30%/)).toBeTruthy();
        expect(screen.getByText(/compression-cylinder-1: pass — 185 psi/)).toBeTruthy();
        expect(screen.getByText(/Replaced head gasket · Parts: Head gasket/)).toBeTruthy();
        expect(screen.getByText(/Codes cleared: yes · Symptom gone: yes/)).toBeTruthy();

        // Every rendered line carries its ledger citation: vehicle, complaint,
        // code, three evidence items, two hypotheses, test, repair, outcome.
        expect(screen.getAllByText(/#\d+/)).toHaveLength(11);
    });

    it('lists the correction and hides the retracted test', () => {
        const { report } = buildClosedGoldenReport({ correctRetest: true });
        render(<CaseReportView report={report} />);

        expect(screen.getByRole('heading', { name: 'Corrections' })).toBeTruthy();
        expect(screen.getByText(/Compression reading was from cylinder 2, not 1/)).toBeTruthy();
        expect(screen.queryByText(/compression-cylinder-1/)).toBeNull();
    });
});
