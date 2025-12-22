export interface DownloadProgress {
    totalBytesExpectedToWrite: number;
    totalBytesWritten: number;
    progress: number; // 0 to 1
}

export interface IModelManagerService {
    /**
     * Ensures the model is available on local storage.
     * If not present, initiates a download.
     * @returns The local file path to the model.
     */
    ensureModelAvailable(modelUrl: string, modelName: string, checksum?: string): Promise<string>;

    /**
     * Returns the local path to the model if it exists.
     */
    getModelPath(modelName: string): Promise<string | null>;

    /**
     * Deletes the local model file.
     */
    deleteModel(modelName: string): Promise<void>;

    /**
     * Checks if the model is currently downloaded.
     */
    isModelDownloaded(modelName: string): Promise<boolean>;

    /**
     * Subscribes to download progress updates.
     * @returns Unsubscribe function.
     */
    onProgress(callback: (progress: DownloadProgress) => void): () => void;
}
