/**
 * Node 2 Infrastructure: Handles text-to-vector conversion.
 */
export interface IEmbeddingService {
    /**
     * Converts a text string into a vector embedding using the configured AI model (e.g., text-embedding-004).
     * @param text The text to embed.
     */
    embed(text: string): Promise<number[]>;

    /**
     * Batch embeds multiple text strings.
     */
    embedBatch(texts: string[]): Promise<number[][]>;
}
