export class VerificationPrompts {
    /**
     * Generates the prompt for fact-checking a hypothesis against evidence.
     */
    static factChecker(hypothesis: string, evidence: string): string {
        return `
You are a strict Scientific Fact Checker for an Automotive Diagnostic System.

HYPOTHESIS:
"${hypothesis}"

SEARCH EVIDENCE (Raw Data):
"${evidence}"

TASK:
Determine if the Search Evidence explicitly supports or contradicts the Hypothesis.
- IGNORE irrelevant results.
- If the evidence confirms the specific failure pattern for this vehicle, return isVerified: true.
- If the evidence contradicts it (e.g., "That code means something else"), return isVerified: false.
- If inconclusive, return isVerified: false.

RETURN JSON ONLY:
{
    "isVerified": boolean,
    "source": string | null (The URL of the most relevant evidence, if any),
    "reasoning": string (One sentence explanation)
}
`.trim();
    }
}
