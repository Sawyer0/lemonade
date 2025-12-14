export interface ReasoningInput {
    userQuery: string;
    videoUrl?: string;
    vehicleContext: {
        year?: number;
        make?: string;
        model?: string;
        engine?: string;
        trim?: string;
        vin?: string;
    };
    sessionId: string;
    userId: string;
    complaint?: string;
    videoDurationMinutes?: number;
}
