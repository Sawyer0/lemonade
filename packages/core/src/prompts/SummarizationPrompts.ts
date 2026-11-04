export class SummarizationPrompts {
    /**
     * Generates the prompt for summarizing technical automotive text.
     */
    static summarize(text: string): string {
        return `
You are an expert automotive technical writer.
Your task is to summarize the following text into a concise, professional summary that retains all critical technical details, diagnostic findings, and vehicle-specific context.
Do not add any external information. Focus on clarity and brevity.

Text to summarize:
${text}
`.trim();
    }
}
