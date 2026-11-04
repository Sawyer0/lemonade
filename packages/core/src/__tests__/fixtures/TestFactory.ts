import { User, Vehicle, DiagnosticSession } from '../../types/models';
import { v4 as uuidv4 } from 'uuid';

export class TestFactory {
    static createUser(overrides?: Partial<User>): User {
        return {
            id: uuidv4(),
            email: 'test@example.com',
            tier: 'free',
            createdAt: new Date(),
            updatedAt: new Date(),
            preferences: { autoOpenCamera: false },
            ...overrides,
        };
    }

    static createVehicle(userId: string, overrides?: Partial<Vehicle>): Vehicle {
        return {
            id: uuidv4(),
            vin: 'TESTVIN1234567890',
            userId: userId,
            specs: {
                year: 2020,
                make: 'Toyota',
                model: 'Camry',
                engine: '2.5L 4-Cyl',
                trim: 'SE',
            },
            activeIssuesCount: 0,
            createdAt: new Date(),
            ...overrides,
        };
    }

    static createSession(userId: string, vehicleId: string, overrides?: Partial<DiagnosticSession>): DiagnosticSession {
        return {
            id: uuidv4(),
            userId,
            vehicleId,
            status: 'active',
            complaint: 'Strange noise',
            obdCodes: [],
            messages: [],
            aiAnalysis: null,
            safety_stop: false,
            cumulativeVideoDurationProcessedMinutes: 0,
            cumulativeAudioDurationProcessedMinutes: 0,
            startedAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        };
    }
}
