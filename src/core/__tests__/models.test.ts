import { describe, it, expect } from 'vitest';
import { VehicleSchema, DiagnosticSessionSchema } from '../types/models';
import { v4 as uuidv4 } from 'uuid';

describe('Domain Models', () => {
    describe('VehicleSchema', () => {
        it('should validate a valid vehicle', () => {
            const validVehicle = {
                id: uuidv4(),
                vin: '12345678901234567',
                userId: 'user1',
                specs: {
                    year: 2020,
                    make: 'Toyota',
                    model: 'Camry',
                    engine: 'V6'
                },
                createdAt: new Date(),
                activeIssuesCount: 0
            };
            const result = VehicleSchema.safeParse(validVehicle);
            expect(result.success).toBe(true);
        });

        it('should reject invalid VIN length', () => {
            const invalidVehicle = {
                id: uuidv4(),
                vin: 'SHORT',
                userId: 'user1',
                specs: { year: 2020, make: 'Toyota', model: 'Camry', engine: 'V6' },
                createdAt: new Date()
            };
            const result = VehicleSchema.safeParse(invalidVehicle);
            expect(result.success).toBe(false);
        });
    });

    describe('DiagnosticSessionSchema', () => {
        it('should validate a valid session', () => {
            const validSession = {
                id: uuidv4(),
                vehicleId: uuidv4(),
                userId: 'user1',
                status: 'active',
                complaint: 'Noise',
                obdCodes: [],
                messages: [],
                updatedAt: new Date(),
                startedAt: new Date(),
                aiAnalysis: null
            };
            const result = DiagnosticSessionSchema.safeParse(validSession);
            expect(result.success).toBe(true);
        });

        it('should reject invalid status', () => {
            const invalidSession = {
                id: uuidv4(),
                vehicleId: uuidv4(),
                status: 'invalid_status',
                complaint: 'Noise',
                updatedAt: new Date()
            };
            const result = DiagnosticSessionSchema.safeParse(invalidSession);
            expect(result.success).toBe(false);
        });
    });
});
