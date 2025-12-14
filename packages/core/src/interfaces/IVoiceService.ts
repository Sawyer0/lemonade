export interface IVoiceService {
    processVoiceCommand(sessionId: string, audioBuffer: Buffer): Promise<void>;
}