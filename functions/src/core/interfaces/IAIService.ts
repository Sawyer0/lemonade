export interface ISafetyAI {
    assessSafety(prompt: string): Promise<string>;
}