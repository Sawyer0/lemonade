import { vi } from 'vitest';
import type { ILogger, NeurosymbolicState, SemanticTriageResult } from '@lemonade/core';
import type { SessionContext } from '../src/diagnosis/sessionContext';

export const session: SessionContext = {
    sessionId: 'session-1',
    userId: 'user-1',
    vehicle: { year: 2019, make: 'Honda', model: 'Civic', vin: '1HGBH41JXMN109186' },
    vehicleJson: '{"year":2019,"make":"Honda","model":"Civic","vin":"1HGBH41JXMN109186"}',
};

export function fakeLogger(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

export function detection(obj: string, cat: string, risk = false): SemanticTriageResult {
    return { id: { obj, cat }, eval: { stat: risk ? 'CRITICAL' : 'NORMAL', risk, note: 'seen' } };
}

export function diagnosis(userOutput: string): NeurosymbolicState {
    return { finalDiagnosis: { userOutput } } as unknown as NeurosymbolicState;
}

export function fakeResponder() {
    return { say: vi.fn().mockResolvedValue(undefined), requestTool: vi.fn().mockResolvedValue(undefined) };
}
