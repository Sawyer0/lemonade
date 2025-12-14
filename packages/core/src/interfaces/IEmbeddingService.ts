export interface IEmbeddingService {
    /**
     * @param text The text to embed.
     */
    embed(text: string): Promise<number[]>;

    embedBatch(texts: string[]): Promise<number[][]>;
}
