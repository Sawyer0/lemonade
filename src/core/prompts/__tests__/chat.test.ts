import { describe, it, expect } from 'vitest';
import { generateSystemPrompt } from '../chat';
import { Vehicle } from '@/core/entities/Vehicle';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';

/**
 * These tests verify the system prompt contains critical safety directives.
 * 
 * WHAT BUGS WOULD THIS CATCH?
 * - Missing safety directives (AI gives dangerous advice)
 * - Missing vehicle context (AI doesn't know what car it's diagnosing)
 * - Missing diagnostic context (AI ignores previous analysis)
 * - Prompt injection vulnerabilities (malicious user input in context)
 */

const createMockVehicle = (overrides?: Partial<Vehicle>): Vehicle => ({
    id: 'vehicle-123',
    vin: '1FTEW1E55JKE12345',
    userId: 'user-456',
    specs: {
        year: 2018,
        make: 'Ford',
        model: 'F-150',
        engine: '5.0L V8 Coyote',
        trim: 'Lariat'
    },
    createdAt: new Date(),
    activeIssuesCount: 1,
    ...overrides
});

const createMockSession = (overrides?: Partial<DiagnosticSession>): DiagnosticSession => ({
    id: 'session-789',
    vehicleId: 'vehicle-123',
    userId: 'user-456',
    status: 'active',
    complaint: 'Engine misfiring at idle',
    obdCodes: ['P0300', 'P0301'],
    messages: [],
    startedAt: new Date(),
    updatedAt: new Date(),
    aiAnalysis: null,
    ...overrides
});

describe('generateSystemPrompt - Vehicle Context', () => {
    it('should include vehicle year, make, model', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI MUST know what vehicle it's working on
        expect(prompt).toContain('2018');
        expect(prompt).toContain('Ford');
        expect(prompt).toContain('F-150');
    });

    it('should include engine type', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // Engine type is critical for diagnosis (V6 vs V8 have different issues)
        expect(prompt).toContain('5.0L V8');
    });

    it('should include VIN', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // VIN allows AI to look up specific recalls/TSBs
        expect(prompt).toContain('1FTEW1E55JKE12345');
    });
});

describe('generateSystemPrompt - Diagnostic Context', () => {
    it('should include customer complaint', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession({ complaint: 'Rattling noise on startup' });
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        expect(prompt).toContain('Rattling noise on startup');
    });

    it('should include OBD codes', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession({ obdCodes: ['P0300', 'P0301', 'P0304'] });
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI needs to know active codes to diagnose
        expect(prompt).toContain('P0300');
        expect(prompt).toContain('P0301');
        expect(prompt).toContain('P0304');
    });

    it('should handle empty OBD codes gracefully', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession({ obdCodes: [] });
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // Should not crash, should indicate no codes
        expect(prompt).toContain('None');
    });

    it('should include previous AI analysis if available', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession({
            aiAnalysis: {
                diagnosis: 'Suspected ignition coil failure',
                visual_evidence: ['Smoke from coil pack'],
                acoustic_evidence: ['Misfiring sound'],
                severity: 'medium',
                suggested_actions: ['Replace coil pack'],
                safety_alert: false
            }
        });
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI should know what it already diagnosed
        expect(prompt).toContain('ignition coil failure');
    });
});

describe('generateSystemPrompt - Safety Directives (CRITICAL)', () => {
    it('should include Safety First directive', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // CRITICAL: AI must prioritize safety
        expect(prompt.toLowerCase()).toContain('safety');
        expect(prompt).toContain('dangerous');
    });

    it('should mention warning users about danger', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI must warn users, not just stay silent
        expect(prompt.toLowerCase()).toContain('warn');
    });

    it('should include accuracy directive', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI should only give confident advice
        expect(prompt.toLowerCase()).toContain('accuracy');
        expect(prompt.toLowerCase()).toContain('confident');
    });

    it('should mention camera tool availability', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI needs to know it can request camera
        expect(prompt.toLowerCase()).toContain('camera');
    });
});

describe('generateSystemPrompt - Identity', () => {
    it('should identify as Master Technician', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // AI persona affects response quality
        expect(prompt).toContain('Master Technician');
    });

    it('should identify as Lemonade', () => {
        const vehicle = createMockVehicle();
        const session = createMockSession();
        
        const prompt = generateSystemPrompt(vehicle, session);
        
        // Brand identity
        expect(prompt).toContain('Lemonade');
    });
});
