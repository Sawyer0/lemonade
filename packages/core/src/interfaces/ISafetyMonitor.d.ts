import { SafetyAssessment } from '../types/safety';
export interface ISafetyMonitor {
    assess(userMessage: string, context: string): Promise<SafetyAssessment>;
}
