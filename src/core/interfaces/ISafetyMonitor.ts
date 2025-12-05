import { SafetyAssessment } from '@/core/types/safety';

export interface ISafetyMonitor {
    assess(userMessage: string, context: string): Promise<SafetyAssessment>;
}
