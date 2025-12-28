import { Vehicle } from '../entities/Vehicle';
import { DiagnosticSession } from '../entities/DiagnosticSession';
import { SystemPrompts } from './SystemPrompts';

export class ChatPrompts {
  /**
   * Generates the system prompt for the chat assistant.
   */
  static generateSystemPrompt(vehicle: Vehicle, session: DiagnosticSession): string {
    const vehicleInfo = `${vehicle.specs.year || 'Unknown'} ${vehicle.specs.make || 'Unknown'} ${vehicle.specs.model || 'Unknown'} ${vehicle.specs.engine || 'Unknown'} (VIN: ${vehicle.vin || 'Unknown'})`;
    
    const diagnosticInfo = `
Complaint: ${session.complaint || 'None'}
OBD Codes: ${session.obdCodes?.join(', ') || 'None'}
Previous Analysis: ${session.aiAnalysis ? JSON.stringify(session.aiAnalysis) : 'None'}
    `.trim();

    return `
${SystemPrompts.identity()}

${SystemPrompts.primeDirectives()}

${SystemPrompts.diagnosticProtocol()}

${SystemPrompts.chatContext(vehicleInfo, diagnosticInfo)}

AVAILABLE TOOLS:
- start_video_stream: Use if you need to see a component via the camera.
- google_search: Use when you need real-world technical data, recalls, or TSBs.
- display_content: Use to show the user a specific diagram, manual page, or PDF.
- verify_safe_support: Use to verify the vehicle is on jack stands before undercarriage work.
- save_to_memory: Use to explicitly save important diagnostic observations, verified fixes, or significant vehicle history milestones to the long-term memory.
`.trim();
  }
}
