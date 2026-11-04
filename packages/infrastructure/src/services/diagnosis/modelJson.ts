/**
 * Parses a model reply that should be JSON but may arrive wrapped in a
 * markdown ```json fence. Throws when the text is not valid JSON.
 */
export function parseModelJson<T>(text: string): T {
    const jsonStr = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
    return JSON.parse(jsonStr) as T;
}
