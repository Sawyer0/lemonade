import { DiagnosticSession, AIAnalysis } from "../types/models";

export interface ISessionRepository {
  create(session: DiagnosticSession): Promise<void>;
  updateAnalysis(sessionId: string, analysis: AIAnalysis): Promise<void>;
  addMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: unknown
  ): Promise<void>;
  getHistory(sessionId: string): Promise<DiagnosticSession | null>;
  delete(sessionId: string): Promise<void>;
  updateStatus(
    sessionId: string,
    status: DiagnosticSession["status"]
  ): Promise<void>;
  flagSafetyStop(sessionId: string, reason: string): Promise<void>;
  findById(id: string): Promise<DiagnosticSession | null>;
  updateVideo(sessionId: string, videoUrl: string): Promise<void>;
  findByVehicleId(vehicleId: string): Promise<DiagnosticSession[]>;
  findByUserId(userId: string): Promise<DiagnosticSession[]>;
  updateComplaint(sessionId: string, complaint: string): Promise<void>;
  updateCumulativeVideoDuration(sessionId: string, minutes: number): Promise<void>;
  updateLastProcessedFrameTimestamp(sessionId: string, timestamp: number): Promise<void>;
  updateCumulativeAudioDuration(sessionId: string, minutes: number): Promise<void>;
  updateLastProcessedAudioChunkTimestamp(sessionId: string, timestamp: number): Promise<void>;

  // XState Persistence
  saveXStateSnapshot(sessionId: string, snapshot: unknown): Promise<void>;
  getXStateSnapshot(sessionId: string): Promise<unknown | null>;
  clearXStateSnapshot(sessionId: string): Promise<void>;
}
