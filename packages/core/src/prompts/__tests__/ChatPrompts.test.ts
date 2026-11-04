import { describe, it, expect } from 'vitest';
import { ChatPrompts } from '../ChatPrompts';
import { Vehicle } from '../../entities/Vehicle';
import { DiagnosticSession } from '../../entities/DiagnosticSession';

describe('ChatPrompts', () => {
    const mockVehicle = {
        specs: { year: 2021, make: 'Honda', model: 'Civic', engine: '2.0L' },
        vin: '1HGBH41JXMN109186',
    } as unknown as Vehicle;

    const mockSession = {
        complaint: 'Brake noise',
        obdCodes: ['P0123'],
        aiAnalysis: { diagnosis: 'Worn pads' },
        messages: [],
    } as unknown as DiagnosticSession;

    describe('generateSystemPrompt', () => {
        it('should generate a comprehensive system prompt', () => {
            const prompt = ChatPrompts.generateSystemPrompt(mockVehicle, mockSession);
            expect(prompt).toContain('2021 Honda Civic');
            expect(prompt).toContain('Brake noise');
            expect(prompt).toContain('P0123');
            expect(prompt).toContain('Worn pads');
            expect(prompt).toContain('AVAILABLE TOOLS');
        });
    });
});
