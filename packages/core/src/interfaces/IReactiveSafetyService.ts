import { SafetyAssessment } from '../types/safety';

export interface IReactiveSafetyService {
    checkSafety(userMessage: string): SafetyAssessment | null;
}
