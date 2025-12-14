import { NeurosymbolicState } from "../types/neurosymbolic";
import { ReasoningInput } from "../types/reasoning";

export interface IMechanicReasoningService {
    diagnose(input: ReasoningInput): Promise<NeurosymbolicState>;
}