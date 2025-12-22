/**
 * Global Context Providers
 *
 * These are the only Context providers in the application.
 * Data state (sessions, messages, vehicles) flows through
 * Firestore listeners (hooks) and SWR, NOT through Context.
 *
 * @see Agent.md - Firestore Pub/Sub section for data patterns
 */

export { AuthProvider, useAuth } from './AuthContext';
export { ToastProvider, useToast } from './ToastContext';

