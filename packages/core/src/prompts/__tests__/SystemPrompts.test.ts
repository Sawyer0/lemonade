import { describe, it, expect } from 'vitest';
import { SystemPrompts } from '../SystemPrompts';

describe('SystemPrompts', () => {
    describe('identity', () => {
        it('should generate an identity prompt', () => {
            const prompt = SystemPrompts.identity();
            expect(prompt).toContain('IDENTITY: You are the Senior Master Technician.');
            expect(prompt).toContain('ASE Certified');
        });
    });

    describe('primeDirectives', () => {
        it('should generate prime directives', () => {
            const prompt = SystemPrompts.primeDirectives();
            expect(prompt).toContain('PRIME DIRECTIVES (NON-NEGOTIABLE)');
            expect(prompt).toContain('LIFE SAFETY');
        });
    });

    describe('diagnosticProtocol', () => {
        it('should generate diagnostic strategy', () => {
            const prompt = SystemPrompts.diagnosticProtocol();
            expect(prompt).toContain('DIAGNOSTIC STRATEGY');
            expect(prompt).toContain('VERIFY: Do not guess.');
        });
    });

    describe('chatContext', () => {
        it('should generate chat context', () => {
            const vehicleContext = '2021 Honda Civic';
            const sessionContext = 'Complaint: Noisy brakes';
            const prompt = SystemPrompts.chatContext(vehicleContext, sessionContext);
            expect(prompt).toContain(vehicleContext);
            expect(prompt).toContain(sessionContext);
        });
    });

    describe('manualAnalysisInstruction', () => {
        it('should generate manual analysis instruction', () => {
            const query = 'How to change the oil?';
            const prompt = SystemPrompts.manualAnalysisInstruction(query);
            expect(prompt).toContain(query);
            expect(prompt).toContain('expert automotive master technician');
        });
    });
});
