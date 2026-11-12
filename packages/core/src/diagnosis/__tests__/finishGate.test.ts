// Finish-gate checklist, claim builder and handoff (LM-19, core side).
// The ledger is built with the shared appendToChain helper so every entry
// carries a valid hash chain; the test library comes from the LM-04
// misfire fixtures plus the LM-34 definition factory.
import { describe, it, expect } from 'vitest';
import {
    buildAbstainFinalDiagnosis,
    buildAbstainHandoff,
    checkDiagnosisClaims,
    claimsForRun,
    type DiagnosisClaim,
} from '../finishGate';
import { appendToChain } from '../../context/__tests__/ledgerFixtures';
import { misfireDefinitions } from '../loop/__tests__/fixtures';
import { validTestDefinition } from '../tests/__tests__/testDefinitionFactory';
import { TestLibrary } from '../tests/testLibrary';
import type { LedgerEntry } from '../../types/case';
import type { DiagnosticLoopState } from '../loop/types';
import { parseDtc } from '../../dtc/parser';

const MISFIRE_LIBRARY = TestLibrary.fromDefinitions(misfireDefinitions());
const OXYGEN_LIBRARY = TestLibrary.fromDefinitions([validTestDefinition()]);

function dtcEntry(previous: LedgerEntry[], codes: string[]): LedgerEntry {
    return appendToChain(previous, 'dtc_read', { codes });
}

function testResultEntry(
    previous: LedgerEntry[],
    testName: string,
    result: 'pass' | 'fail' | 'inconclusive',
    measuredValue?: number,
    unit?: string,
): LedgerEntry {
    return appendToChain(previous, 'test_result', {
        testName,
        result,
        ...(measuredValue !== undefined ? { measuredValue } : {}),
        ...(unit !== undefined ? { unit } : {}),
    });
}

function observationEntry(previous: LedgerEntry[], text: string): LedgerEntry {
    return appendToChain(previous, 'observation', { text });
}

function hypothesisClaim(citations: string[]): DiagnosisClaim {
    return { kind: 'hypothesis', id: 'hypothesis', text: 'Ignition coil failure', citations };
}

function dtcClaim(code: string, citations: string[]): DiagnosisClaim {
    return { kind: 'dtc', id: `dtc-${code.toLowerCase()}`, text: `DTC ${code} was read`, code, citations };
}

function testClaim(testId: string, citations: string[]): DiagnosisClaim {
    return { kind: 'test', id: `test-${testId}`, text: `Test ${testId} was run`, testId, citations };
}

function specClaim(testId: string, value: number, unit: string, citations: string[]): DiagnosisClaim {
    return {
        kind: 'spec',
        id: `spec-${testId}`,
        text: `Test "${testId}" measured ${value} ${unit}`,
        testId,
        value,
        unit,
        citations,
    };
}

function loopStateWithTests(completedTestIds: string[]): DiagnosticLoopState {
    return {
        differential: { hypotheses: [], otherProbability: 0, round: 1 },
        disassemblyState: 'none',
        satisfiedPreconditionIds: [],
        spentUsd: 0,
        budgetUsd: 500,
        safetyCriticalHypothesisIds: [],
        repairCostsUsd: {},
        completedTestIds,
        history: [],
        decision: null,
    };
}

describe('checkDiagnosisClaims', () => {
    it('passes a hypothesis claim cited to a citable test_result entry', () => {
        const entries = [testResultEntry([], 'swap-coil-cylinder', 'fail')];
        const verdict = checkDiagnosisClaims([hypothesisClaim([entries[0].id])], entries, MISFIRE_LIBRARY);
        expect(verdict).toEqual({ passed: true, failures: [] });
    });

    it('fails missing-citation when a claim cites nothing', () => {
        const entries = [testResultEntry([], 'swap-coil-cylinder', 'fail')];
        const verdict = checkDiagnosisClaims([hypothesisClaim([])], entries, MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures).toEqual([
            {
                claimId: 'hypothesis',
                code: 'missing-citation',
                reason: 'Claim "Ignition coil failure" cites no ledger entry',
            },
        ]);
    });

    it('fails unknown-citation when a cited entry is not in the ledger', () => {
        const entries = [testResultEntry([], 'swap-coil-cylinder', 'fail')];
        const verdict = checkDiagnosisClaims(
            [hypothesisClaim(['00000000-0000-4000-8000-000000000000'])],
            entries,
            MISFIRE_LIBRARY,
        );
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('unknown-citation');
    });

    it('fails retracted-citation when the cited entry was corrected', () => {
        const wrong = testResultEntry([], 'swap-coil-cylinder', 'pass');
        const corrected = appendToChain(
            [wrong],
            'correction',
            { text: 'The coil swap result was misread.' },
            { correctsEntryId: wrong.id },
        );
        const verdict = checkDiagnosisClaims([hypothesisClaim([wrong.id])], [wrong, corrected], MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('retracted-citation');
    });

    it('fails inadmissible-citation when the cited entry is model-sourced', () => {
        const modelEntry = appendToChain(
            [],
            'test_result',
            { testName: 'swap-coil-cylinder', result: 'fail' },
            { source: 'model' },
        );
        const verdict = checkDiagnosisClaims([hypothesisClaim([modelEntry.id])], [modelEntry], MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('inadmissible-citation');
    });

    it('fails inadmissible-citation when the cited entry is a hypothesis entry', () => {
        const hypothesisEntry = appendToChain([], 'hypothesis', { text: 'Ignition coil failure', confidence: 0.9 });
        const verdict = checkDiagnosisClaims(
            [hypothesisClaim([hypothesisEntry.id])],
            [hypothesisEntry],
            MISFIRE_LIBRARY,
        );
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('inadmissible-citation');
    });

    it('fails inadmissible-citation when the cited entry is advisory research', () => {
        const advisoryEntry = appendToChain(
            [],
            'advisory',
            { kind: 'recall', status: 'found', summary: 'A recall mentions coils.', items: [], source: 'nhtsa' },
            { source: 'research' },
        );
        const verdict = checkDiagnosisClaims([hypothesisClaim([advisoryEntry.id])], [advisoryEntry], MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('inadmissible-citation');
    });

    it('passes a DTC claim for a known code recorded by a cited dtc_read entry', () => {
        const entries = [dtcEntry([], ['P0300'])];
        const verdict = checkDiagnosisClaims([dtcClaim('P0300', [entries[0].id])], entries, MISFIRE_LIBRARY);
        expect(verdict).toEqual({ passed: true, failures: [] });
    });

    it('fails unknown-dtc for a malformed code', () => {
        const entries = [dtcEntry([], ['P0300'])];
        const verdict = checkDiagnosisClaims([dtcClaim('P9999', [entries[0].id])], entries, MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('unknown-dtc');
    });

    it('fails unknown-dtc for a generic code with no table entry', () => {
        const entries = [dtcEntry([], ['P0300'])];
        const verdict = checkDiagnosisClaims([dtcClaim('P0999', [entries[0].id])], entries, MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('unknown-dtc');
    });

    it('fails dtc-not-in-ledger when no cited entry recorded the code', () => {
        const dtc = dtcEntry([], ['P0300']);
        const observation = observationEntry([dtc], 'misfire at idle');
        const entries = [dtc, observation];
        const verdict = checkDiagnosisClaims([dtcClaim('P0420', [observation.id])], entries, MISFIRE_LIBRARY);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('dtc-not-in-ledger');
    });

    it('passes a test claim for a test id in the library', () => {
        const entries = [testResultEntry([], 'swap-coil-cylinder', 'fail')];
        const verdict = checkDiagnosisClaims(
            [testClaim('swap-coil-cylinder', [entries[0].id])],
            entries,
            MISFIRE_LIBRARY,
        );
        expect(verdict).toEqual({ passed: true, failures: [] });
    });

    it('passes a test claim when the ledger recorded the test title', () => {
        const entries = [testResultEntry([], 'Swap the coil to another cylinder', 'fail')];
        const verdict = checkDiagnosisClaims(
            [testClaim('swap-coil-cylinder', [entries[0].id])],
            entries,
            MISFIRE_LIBRARY,
        );
        expect(verdict).toEqual({ passed: true, failures: [] });
    });

    it('fails unknown-test when the cited test is not in the library', () => {
        const entries = [testResultEntry([], 'replace-the-engine', 'fail')];
        const verdict = checkDiagnosisClaims(
            [testClaim('replace-the-engine', [entries[0].id])],
            entries,
            MISFIRE_LIBRARY,
        );
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('unknown-test');
    });

    it('fails test-library-unavailable when no library is loaded', () => {
        const entries = [testResultEntry([], 'swap-coil-cylinder', 'fail')];
        const verdict = checkDiagnosisClaims([testClaim('swap-coil-cylinder', [entries[0].id])], entries);
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('test-library-unavailable');
    });

    it('passes a spec claim whose value is inside the expected range', () => {
        const entries = [testResultEntry([], 'measure-oxygen-sensor-switching', 'pass', 0.5, 'volts')];
        const verdict = checkDiagnosisClaims(
            [specClaim('measure-oxygen-sensor-switching', 0.5, 'volts', [entries[0].id])],
            entries,
            OXYGEN_LIBRARY,
        );
        expect(verdict).toEqual({ passed: true, failures: [] });
    });

    it('fails spec-out-of-range when the value is outside the expected range', () => {
        const entries = [testResultEntry([], 'measure-oxygen-sensor-switching', 'fail', 1.5, 'volts')];
        const verdict = checkDiagnosisClaims(
            [specClaim('measure-oxygen-sensor-switching', 1.5, 'volts', [entries[0].id])],
            entries,
            OXYGEN_LIBRARY,
        );
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('spec-out-of-range');
    });

    it('fails spec-no-expectation when the test has no expected value in that unit', () => {
        const entries = [testResultEntry([], 'measure-oxygen-sensor-switching', 'pass', 14.7, 'psi')];
        const verdict = checkDiagnosisClaims(
            [specClaim('measure-oxygen-sensor-switching', 14.7, 'psi', [entries[0].id])],
            entries,
            OXYGEN_LIBRARY,
        );
        expect(verdict.passed).toBe(false);
        expect(verdict.failures[0].code).toBe('spec-no-expectation');
    });
});

describe('claimsForRun', () => {
    it('builds hypothesis, DTC, test and spec claims from structured evidence', () => {
        const dtc = dtcEntry([], ['P0300']);
        const coilResult = testResultEntry([dtc], 'swap-coil-cylinder', 'fail');
        const oxygenResult = testResultEntry([coilResult], 'measure-oxygen-sensor-switching', 'pass', 0.5, 'volts');
        const parsed = parseDtc('P0300');
        if (!parsed.ok) throw new Error('P0300 must parse');
        const claims = claimsForRun({
            diagnosis: 'Ignition coil failure',
            dtcCodes: [parsed.parsed],
            loopState: loopStateWithTests(['swap-coil-cylinder', 'measure-oxygen-sensor-switching']),
            testDefinitions: [...misfireDefinitions(), validTestDefinition()],
            ledger: [dtc, coilResult, oxygenResult],
        });
        expect(claims).toHaveLength(5);
        const byKind = new Map(claims.map((claim) => [claim.id, claim]));
        expect(byKind.get('hypothesis')).toMatchObject({
            kind: 'hypothesis',
            citations: [dtc.id, coilResult.id, oxygenResult.id],
        });
        expect(byKind.get('dtc-p0300')).toMatchObject({ kind: 'dtc', code: 'P0300', citations: [dtc.id] });
        expect(byKind.get('test-swap-coil-cylinder')).toMatchObject({
            kind: 'test',
            testId: 'swap-coil-cylinder',
            citations: [coilResult.id],
        });
        expect(byKind.get('test-measure-oxygen-sensor-switching')).toMatchObject({
            kind: 'test',
            testId: 'measure-oxygen-sensor-switching',
            citations: [oxygenResult.id],
        });
        expect(byKind.get(`spec-${oxygenResult.id}`)).toMatchObject({
            kind: 'spec',
            testId: 'measure-oxygen-sensor-switching',
            value: 0.5,
            unit: 'volts',
            citations: [oxygenResult.id],
        });
        // The built claims pass the checklist: nothing the gate speaks lacks a citation.
        const library = TestLibrary.fromDefinitions([...misfireDefinitions(), validTestDefinition()]);
        expect(checkDiagnosisClaims(claims, [dtc, coilResult, oxygenResult], library).passed).toBe(true);
    });

    it('leaves the hypothesis claim uncited on an empty ledger', () => {
        const claims = claimsForRun({ diagnosis: 'Ignition coil failure', dtcCodes: [], ledger: [] });
        expect(claims).toHaveLength(1);
        expect(claims[0]).toMatchObject({ kind: 'hypothesis', citations: [] });
        expect(checkDiagnosisClaims(claims, [], MISFIRE_LIBRARY).passed).toBe(false);
    });

    it('never cites a model-sourced entry', () => {
        const modelEntry = appendToChain(
            [],
            'test_result',
            { testName: 'reasoner_sandbox_computation', result: 'pass', notes: 'fuel trims lean' },
            { source: 'model' },
        );
        const claims = claimsForRun({ diagnosis: 'Lean fuel trims', dtcCodes: [], ledger: [modelEntry] });
        expect(claims).toHaveLength(1);
        expect(claims[0].citations).toEqual([]);
    });
});

describe('buildAbstainHandoff', () => {
    it('carries confirmed, ruled out, next test and an escalation rule naming the block', () => {
        const handoff = buildAbstainHandoff({
            reason: 'Challenger found a decisive objection',
            confirmed: ['P0300 was read from the vehicle'],
            ruledOut: ['Fuel pump failure: fuel pressure held at 55 psi'],
            nextTest: 'Measure spark at the plug',
            blockedReasons: ['Challenger found a decisive objection'],
        });
        expect(handoff.reason).toBe('Challenger found a decisive objection');
        expect(handoff.confirmed).toEqual(['P0300 was read from the vehicle']);
        expect(handoff.ruledOut).toEqual(['Fuel pump failure: fuel pressure held at 55 psi']);
        expect(handoff.nextTest).toBe('Measure spark at the plug');
        expect(handoff.escalateWhen).toContain('Challenger found a decisive objection');
    });
});

describe('buildAbstainFinalDiagnosis', () => {
    it('speaks the handoff as a referral, never a diagnosis', () => {
        const handoff = buildAbstainHandoff({
            reason: 'Challenger found a decisive objection',
            confirmed: ['P0300 was read from the vehicle'],
            ruledOut: ['Fuel pump failure'],
            nextTest: 'Measure spark at the plug',
            blockedReasons: ['Challenger found a decisive objection'],
        });
        const diagnosis = buildAbstainFinalDiagnosis(handoff, ['Challenger found a decisive objection.']);
        expect(diagnosis.decision).toBe('REFER_TO_HUMAN');
        expect(diagnosis.metaConfidence).toBe(0);
        expect(diagnosis.userOutput).toContain('Confirmed: P0300 was read from the vehicle');
        expect(diagnosis.userOutput).toContain('Ruled out: Fuel pump failure');
        expect(diagnosis.userOutput).toContain('Next test: Measure spark at the plug.');
        expect(diagnosis.userOutput).toContain('When to escalate:');
        expect(diagnosis.requiredActions).toContain('Consult Human Mechanic');
        expect(diagnosis.userOutput).not.toContain('Ignition coil failure');
    });

    it('asks for a human with no next test when nothing is planned', () => {
        const handoff = buildAbstainHandoff({
            reason: 'No ledger citations',
            confirmed: [],
            ruledOut: [],
            nextTest: null,
            blockedReasons: ['No ledger citations'],
        });
        const diagnosis = buildAbstainFinalDiagnosis(handoff, ['No ledger citations.']);
        expect(diagnosis.userOutput).toContain('No further test is planned');
        expect(diagnosis.requiredActions).toEqual(['Consult Human Mechanic']);
    });
});
