import * as FileSystem from 'expo-file-system/legacy';
import { ILogger, IModelManagerService, DownloadProgress } from '@lemonade/core';

export class ModelManagerService implements IModelManagerService {
    private progressListeners: ((progress: DownloadProgress) => void)[] = [];
    private downloadResumable: FileSystem.DownloadResumable | null = null;

    constructor(private logger: ILogger) {}

    /**
     * Ensures the model is available in the cacheDirectory.
     * cacheDirectory is used on iOS because it is automatically excluded from iCloud backups,
     * which is a requirement for large model files.
     */
    async ensureModelAvailable(modelUrl: string, modelName: string): Promise<string> {
        const localPath = `${FileSystem.cacheDirectory}${modelName}`;
        this.logger.debug(`Checking model availability at: ${localPath}`);

        const fileInfo = await FileSystem.getInfoAsync(localPath);

        if (fileInfo.exists) {
            this.logger.info(`Model ${modelName} already exists locally.`, { localPath });
            // In a production app, we would verify the checksum here.
            return localPath;
        }

        this.logger.info(`Model not found. Initiating secure download...`, { modelUrl });

        const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            const data: DownloadProgress = {
                totalBytesExpectedToWrite: downloadProgress.totalBytesExpectedToWrite,
                totalBytesWritten: downloadProgress.totalBytesWritten,
                progress,
            };
            this.progressListeners.forEach((l) => l(data));
        };

        this.downloadResumable = FileSystem.createDownloadResumable(modelUrl, localPath, {}, callback);

        try {
            const result = await this.downloadResumable.downloadAsync();
            if (!result) {
                throw new Error('Download failed: result is empty.');
            }

            this.logger.info(`Model ${modelName} initialized successfully.`, { uri: result.uri });
            return result.uri;
        } catch (e) {
            this.logger.error(`Critical failure during model download: ${modelName}`, e);
            throw e;
        } finally {
            this.downloadResumable = null;
        }
    }

    async getModelPath(modelName: string): Promise<string | null> {
        const localPath = `${FileSystem.cacheDirectory}${modelName}`;
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        return fileInfo.exists ? localPath : null;
    }

    async deleteModel(modelName: string): Promise<void> {
        const localPath = `${FileSystem.cacheDirectory}${modelName}`;
        await FileSystem.deleteAsync(localPath, { idempotent: true });
        this.logger.info(`Local model purged.`, { modelName });
    }

    async isModelDownloaded(modelName: string): Promise<boolean> {
        const localPath = `${FileSystem.cacheDirectory}${modelName}`;
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        return fileInfo.exists;
    }

    onProgress(callback: (progress: DownloadProgress) => void): () => void {
        this.progressListeners.push(callback);
        return () => {
            this.progressListeners = this.progressListeners.filter((l) => l !== callback);
        };
    }
}
