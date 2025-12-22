import React, { createContext, useContext, useState, useEffect } from 'react';
import { IModelManagerService, ILocalPerceptionService, DownloadProgress } from '@lemonade/core';
import { ModelManagerService } from '../services/ModelManagerService';
import { LocalPerceptionService } from '../services/LocalPerceptionService';
import { PerformanceMonitor } from '../services/PerformanceMonitor';
import { MobileLogger } from '../services/MobileLogger';

// SmoVLM2 GGUF - Recommended 4-bit quantized version
const MODEL_URL = "https://huggingface.co/bartowski/SmolVLM2-2.2B-Instruct-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Q4_K_M.gguf";
const MODEL_NAME = "SmolVLM2-2.2B-Instruct-Q4_K_M.gguf";

interface LocalPerceptionContextType {
    isReady: boolean;
    isDownloading: boolean;
    downloadProgress: number;
    error: string | null;
    ensureModel: () => Promise<void>;
    localPerception: ILocalPerceptionService | null;
}

const LocalPerceptionContext = createContext<LocalPerceptionContextType | undefined>(undefined);

export function LocalPerceptionProvider({ children }: { children: React.ReactNode }) {
    const [isReady, setIsReady] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [services, setServices] = useState<{
        modelManager: IModelManagerService;
        localPerception: ILocalPerceptionService;
    } | null>(null);

    useEffect(() => {
        const logger = new MobileLogger();
        const modelManager = new ModelManagerService(logger);
        const performanceMonitor = new PerformanceMonitor(logger);
        const localPerception = new LocalPerceptionService(logger, performanceMonitor);

        setServices({ modelManager, localPerception });

        // Check if model exists on start to enable local mode immediately if available
        modelManager.isModelDownloaded(MODEL_NAME).then(async (downloaded) => {
            if (downloaded) {
                try {
                    const path = await modelManager.getModelPath(MODEL_NAME);
                    if (path) {
                        await localPerception.initialize(path);
                        await localPerception.warmup();
                        setIsReady(true);
                    }
                } catch (e) {
                    logger.error('Failed to auto-initialize local LLM', e);
                }
            }
        });

        return () => {
            localPerception.dispose();
        };
    }, []);

    const ensureModel = async () => {
        if (!services) return;

        setIsDownloading(true);
        setError(null);

        const unsub = services.modelManager.onProgress((p) => {
            setDownloadProgress(p.progress);
        });

        try {
            const path = await services.modelManager.ensureModelAvailable(MODEL_URL, MODEL_NAME);
            await services.localPerception.initialize(path);
            await services.localPerception.warmup();
            setIsReady(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Critical setup failure');
        } finally {
            unsub();
            setIsDownloading(false);
        }
    };

    return (
        <LocalPerceptionContext.Provider value={{
            isReady,
            isDownloading,
            downloadProgress,
            error,
            ensureModel,
            localPerception: services?.localPerception || null
        }}>
            {children}
        </LocalPerceptionContext.Provider>
    );
}

export function useLocalPerception() {
    const context = useContext(LocalPerceptionContext);
    if (!context) throw new Error("useLocalPerception must be used within LocalPerceptionProvider");
    return context;
}
