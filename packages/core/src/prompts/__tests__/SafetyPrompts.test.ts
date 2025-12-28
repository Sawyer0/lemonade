import { describe, it, expect } from 'vitest';
import { SafetyPrompts } from '../SafetyPrompts';

describe('SafetyPrompts', () => {
  describe('verifySupport', () => {
    it('should generate a prompt containing critical safety checks', () => {
      const prompt = SafetyPrompts.verifySupport();
      expect(prompt).toContain('CRITICAL SAFETY CHECK');
      expect(prompt).toContain('Jack Stand Detection');
      expect(prompt).toContain('RESPONSE FORMAT (JSON)');
    });
  });

  describe('redZoneWarning', () => {
    it('should generate a red zone warning message', () => {
      const prompt = SafetyPrompts.redZoneWarning();
      expect(prompt).toContain('🛡️ **SAFETY STOP: Jack Stands Required.**');
      expect(prompt).toContain('Hydraulic jacks can fail suddenly.');
    });
  });

  describe('verificationPassed', () => {
    it('should generate a verification passed message', () => {
      const prompt = SafetyPrompts.verificationPassed();
      expect(prompt).toContain('✅ **Support Verified.**');
      expect(prompt).toContain('Clear to proceed.');
    });
  });

  describe('safetyAssessment', () => {
    it('should generate an assessment prompt with user message and context', () => {
      const userMessage = 'I want to check the brakes';
      const context = 'Vehicle: 2021 Honda Civic';
      const prompt = SafetyPrompts.safetyAssessment(userMessage, context);
      
      expect(prompt).toContain(userMessage);
      expect(prompt).toContain(context);
      expect(prompt).toContain('CRITICAL CHECKS (Immediate Intervention Required)');
    });
  });

  describe('masterTechInstruction', () => {
    it('should generate a general safety instruction', () => {
      const prompt = SafetyPrompts.masterTechInstruction();
      expect(prompt).toContain('SAFETY INSTRUCTION: You are a Master Technician.');
      expect(prompt).toContain('verifySafeSupport tool');
    });
  });
});
