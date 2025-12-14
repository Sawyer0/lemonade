"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSystemPrompt = void 0;
const system_1 = require("./system");
const generateSystemPrompt = (vehicle, session) => {
    const vehicleInfo = `${vehicle.specs.year || 'Unknown'} ${vehicle.specs.make || 'Unknown'} ${vehicle.specs.model || 'Unknown'} ${vehicle.specs.engine || 'Unknown'} (VIN: ${vehicle.vin || 'Unknown'})`;
    const diagnosticInfo = `
    Complaint: ${session.complaint}
    OBD Codes: ${session.obdCodes?.join(', ') || 'None'}    Previous Analysis: ${session.aiAnalysis ? JSON.stringify(session.aiAnalysis) : 'None'}  `;
    return `
    ${system_1.SYSTEM_PROMPTS.IDENTITY}
    
    ${system_1.SYSTEM_PROMPTS.PRIME_DIRECTIVES}
    
    ${system_1.SYSTEM_PROMPTS.DIAGNOSTIC_PROTOCOL}
    
    ${system_1.SYSTEM_PROMPTS.CHAT_CONTEXT(vehicleInfo, diagnosticInfo)}
    
    AVAILABLE TOOLS:
    - Camera: Request usage if you need to see a component (e.g., "Show me the serpentine belt").

    NOTE: You have native access to Google Search. DO NOT call a "search" or "google_search" tool. If you need to search, just answer the question directly.
  `;
};
exports.generateSystemPrompt = generateSystemPrompt;
