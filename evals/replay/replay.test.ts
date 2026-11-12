import { describe, expect, it } from 'vitest';
import { verifyLedgerChain } from '@lemonade/core';
import goldenDatasetJson from '../../packages/infrastructure/src/observability/data/golden_dataset.json';
import { diagnoseEvidence } from './fakeMechanic';
import { loadGoldenRecordedCases } from './recordedCases';
import { buildLedger, diagnosisEvidence, recordedCaseFromScenario, Sha256LedgerHasher } from './recordedCase';
import { parseGoldenScenarios } from './recordedCases';
import { replayAll, replayRecordedCase } from './replayRunner';

describe('case replay', () => {
    it('replays all 20 golden cases and every one passes', () => {
        const report = replayAll(loadGoldenRecordedCases());
        expect(report.totalCases).toBe(20);
        expect(report.passedCases).toBe(20);
        expect(report.accuracyPct).toBe(100);
        expect(report.safetyPct).toBe(100);
    });

    it('is deterministic: two runs give the identical report', () => {
        const cases = loadGoldenRecordedCases();
        expect(replayAll(cases)).toEqual(replayAll(loadGoldenRecordedCases()));
    });

    it('replays the fuel-leak case as a safety stop', () => {
        const fuel = loadGoldenRecordedCases().find((recorded) => recorded.scenarioId === 'scenario-2');
        expect(fuel).toBeDefined();
        const outcome = replayRecordedCase(fuel!);
        expect(outcome.passed).toBe(true);
        expect(outcome.safetyMatch).toBe(true);
        expect(outcome.ruleId).toBe('fuel-leak');
    });

    it('replays the orange HV cable case as a safety stop', () => {
        const hv = loadGoldenRecordedCases().find((recorded) => recorded.scenarioId === 'scenario-10');
        expect(hv).toBeDefined();
        const outcome = replayRecordedCase(hv!);
        expect(outcome.passed).toBe(true);
        expect(outcome.safetyMatch).toBe(true);
        expect(outcome.ruleId).toBe('hv-cable');
    });

    it('answers an unknown complaint with the uncertain fallback and no stop', () => {
        const diagnosis = diagnoseEvidence('My cup holder rattles when I open the glove box.');
        expect(diagnosis.ruleId).toBe('uncertain');
        expect(diagnosis.safetyStop).toBe(false);
    });

    it('keeps every recorded ledger hash-chained and verifiable', () => {
        const hasher = new Sha256LedgerHasher();
        for (const recorded of loadGoldenRecordedCases()) {
            expect(verifyLedgerChain(hasher, recorded.ledger)).toBe(true);
        }
    });

    it('fails chain verification when a ledger entry is tampered with', () => {
        const [first] = loadGoldenRecordedCases();
        expect(first).toBeDefined();
        const tampered = first!.ledger.map((entry) => ({ ...entry }));
        const observation = tampered.find((entry) => entry.type === 'observation');
        expect(observation).toBeDefined();
        if (observation?.type === 'observation') {
            observation.payload = { text: 'Nothing is wrong with the car.' };
        }
        expect(verifyLedgerChain(new Sha256LedgerHasher(), tampered)).toBe(false);
    });

    it('feeds the fake only the evidence that existed at diagnosis time', () => {
        const [first] = loadGoldenRecordedCases();
        expect(first).toBeDefined();
        const evidence = diagnosisEvidence(first!);
        expect(evidence).toContain('observation:');
        expect(evidence).not.toContain(first!.expectedDiagnosis);
    });

    it('builds the same ledger twice from the same scenario', () => {
        const [scenario] = parseGoldenScenarios(goldenDatasetJson);
        expect(scenario).toBeDefined();
        expect(recordedCaseFromScenario(scenario!)).toEqual(recordedCaseFromScenario(scenario!));
    });

    it('rejects a malformed golden dataset', () => {
        expect(() => parseGoldenScenarios({ not: 'an array' })).toThrow('Golden dataset must be a JSON array');
        expect(() => parseGoldenScenarios([{ id: 'x' }])).toThrow('no string id and name');
    });

    it('builds a ledger whose hashes cover the content', () => {
        const caseId = '11111111-1111-1111-1111-111111111111';
        const ledger = buildLedger(caseId, [
            {
                type: 'observation',
                actor: { kind: 'user', id: 'tech' },
                source: 'tech',
                payload: { text: 'Battery light is on.' },
            },
        ]);
        expect(ledger).toHaveLength(1);
        expect(verifyLedgerChain(new Sha256LedgerHasher(), ledger)).toBe(true);
    });
});
