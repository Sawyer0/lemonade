import { describe, it, expect } from 'vitest';
import { MechanicPrompts } from '../MechanicPrompts';
import { Vehicle } from '../../types/models';

describe('MechanicPrompts', () => {
    const mockVehicle: Vehicle = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        vin: '1HGBH41JXMN109186',
        userId: 'user-123',
        specs: {
            year: 2021,
            make: 'Honda',
            model: 'Civic',
            engine: '2.0L L4',
        },
        activeIssuesCount: 0,
        createdAt: new Date(),
    };

    describe('reasoning', () => {
        it('should generate a prompt containing vehicle details', () => {
            const prompt = MechanicPrompts.reasoning(mockVehicle);

            expect(prompt).toContain('2021 Honda Civic');
            expect(prompt).toContain('1HGBH41JXMN109186');
            expect(prompt).toContain('ROLE: You are the Senior Master Technician');
        });

        it('should include the core protocol steps', () => {
            const prompt = MechanicPrompts.reasoning(mockVehicle);

            expect(prompt).toContain('STEP 1: CONTEXT CHECK');
            expect(prompt).toContain('STEP 2: STALENESS & GAP CHECK');
            expect(prompt).toContain('STEP 3: EXTERNAL VALIDATION');
        });

        it('should include the system 2 reasoning process', () => {
            const prompt = MechanicPrompts.reasoning(mockVehicle);

            expect(prompt).toContain('Step 1: PERCEPTION');
            expect(prompt).toContain('Step 2: DECOUPLING');
            expect(prompt).toContain('Step 3: SYMBOLIC RETRIEVAL');
            expect(prompt).toContain('Step 4: REASONING TRACE');
            expect(prompt).toContain('Step 5: FINAL OUTPUT');
        });
    });

    describe('textDiagnosis', () => {
        it('should generate a text diagnosis prompt with user query and context', () => {
            const userQuery = 'My car is making a weird noise';
            const context = 'Vehicle: 2021 Honda Civic';
            const verificationInfo = 'No recalls found';
            const prompt = MechanicPrompts.textDiagnosis(userQuery, context, verificationInfo);

            expect(prompt).toContain(userQuery);
            expect(prompt).toContain(context);
            expect(prompt).toContain(verificationInfo);
            expect(prompt).toContain('Output strictly valid JSON');
        });
    });
});
