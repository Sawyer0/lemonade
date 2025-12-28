import { describe, it, expect } from 'vitest';
import { VoicePrompts } from '../VoicePrompts';

describe('VoicePrompts', () => {
  const vehicleContext = '2021 Honda Civic';

  describe('commandAnalysis', () => {
    it('should generate a voice command analysis prompt with vehicle context', () => {
      const prompt = VoicePrompts.commandAnalysis(vehicleContext);
      expect(prompt).toContain(vehicleContext);
      expect(prompt).toContain('Tech-to-Tech terminology');
      expect(prompt).toContain('hands-free environment');
    });
  });
});
