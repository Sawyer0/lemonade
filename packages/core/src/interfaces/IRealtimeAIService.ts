export interface VehicleContext {
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    engine?: string;
}

export interface IRealtimeAIService {
    /**
     * @param apiKey The API key for authentication.
     */
    connect(apiKey: string): Promise<void>;

    disconnect(): void;

    /**
     * @param data The data to send (text, real-time input, etc.).
     */
    send(data: string | object): void;

    readonly isConnected: boolean;
}
