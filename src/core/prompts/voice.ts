export const VOICE_PROMPTS = {
  COMMAND_ANALYSIS: (vehicleContext: string) => `
    Listen to the audio command in the context of: ${vehicleContext}
    Provide a concise, helpful response.
    If it's a question, answer it using Tech-to-Tech terminology.
    If it's an observation, acknowledge it and update your mental model.
    Keep responses short and actionable suitable for a hands-free environment.
  `
};
