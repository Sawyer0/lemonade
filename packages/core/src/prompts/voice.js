"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_PROMPTS = void 0;
exports.VOICE_PROMPTS = {
    COMMAND_ANALYSIS: (vehicleContext) => `
    Listen to the audio command in the context of: ${vehicleContext}
    Provide a concise, helpful response.
    If it's a question, answer it using Tech-to-Tech terminology.
    If it's an observation, acknowledge it and update your mental model.
    Keep responses short and actionable suitable for a hands-free environment.
  `
};
