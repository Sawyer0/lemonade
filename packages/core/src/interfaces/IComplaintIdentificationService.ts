export interface IComplaintIdentificationService {
    identifyAndSetComplaint(sessionId: string, currentMessageContent: string): Promise<void>;
}
