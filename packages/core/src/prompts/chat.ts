import { Vehicle } from '../entities/Vehicle';
import { DiagnosticSession } from '../entities/DiagnosticSession';
import { SYSTEM_PROMPTS } from './system';

export const generateSystemPrompt = (vehicle: Vehicle, session: DiagnosticSession): string => {
  const vehicleInfo = `${vehicle.specs.year || 'Unknown'} ${vehicle.specs.make || 'Unknown'} ${vehicle.specs.model || 'Unknown'} ${vehicle.specs.engine || 'Unknown'} (VIN: ${vehicle.vin || 'Unknown'})`; const diagnosticInfo = `
    Complaint: ${session.complaint}
    OBD Codes: ${session.obdCodes?.join(', ') || 'None'}    Previous Analysis: ${session.aiAnalysis ? JSON.stringify(session.aiAnalysis) : 'None'}  `;

  return `
    ${SYSTEM_PROMPTS.IDENTITY}
    
    ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}
    
    ${SYSTEM_PROMPTS.DIAGNOSTIC_PROTOCOL}
    
    ${SYSTEM_PROMPTS.CHAT_CONTEXT(vehicleInfo, diagnosticInfo)}
    
    AVAILABLE TOOLS:
    - Camera: Request usage if you need to see a component (e.g., "Show me the serpentine belt").

    NOTE: You have native access to Google Search. DO NOT call a "search" or "google_search" tool. If you need to search, just answer the question directly.
  `;
};
