import { describe, it, expect } from 'vitest';
import { ComplaintPrompts } from '../ComplaintPrompts';

describe('ComplaintPrompts', () => {
  describe('identification', () => {
    it('should generate a complaint identification prompt with the message', () => {
      const message = 'My car wont start';
      const prompt = ComplaintPrompts.identification(message);
      expect(prompt).toContain(message);
      expect(prompt).toContain('Identify the core vehicle complaint');
    });
  });
});
