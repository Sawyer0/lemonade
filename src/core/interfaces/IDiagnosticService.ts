// Re-export focused interfaces for backward compatibility
// New code should import from specific interface files
export type { IChatService } from './IChatService';
export type { IVideoAnalysisService } from './IVideoAnalysisService';
export type { ISessionService } from './ISessionService';
export type { IVoiceService } from './IVoiceService';

import type { IChatService } from './IChatService';
import type { IVideoAnalysisService } from './IVideoAnalysisService';
import type { ISessionService } from './ISessionService';
import type { IVoiceService } from './IVoiceService';

/**
 * @deprecated Use focused interfaces instead: IChatService, IVideoAnalysisService, ISessionService, IVoiceService
 * This composite interface is kept for backward compatibility during migration.
 */
export interface IDiagnosticService extends IChatService, IVideoAnalysisService, ISessionService, IVoiceService {}
