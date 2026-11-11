/** How a spoken delivery at an idle gap ended. */
export type DeliveryOutcome = 'delivered' | 'interrupted';

/**
 * The live session, as the result injector needs it. Implemented over the
 * LiveKit AgentSession in livekit-agent.ts; faked in tests. Delivery never
 * cancels a job: an interrupted finding is re-queued, and a safety stop is
 * spoken uninterruptibly.
 */
export interface TalkerSession {
    /** Add text to the model's context without generating speech. */
    addSilentContext(text: string): Promise<void>;
    /**
     * Wait for an idle gap, hold it while speaking, then speak. Holding
     * the gap keeps two findings from racing into a reply concurrently.
     * Returns whether the line played out or the user talked over it.
     */
    speakAtIdle(text: string): Promise<DeliveryOutcome>;
    /** Cut current speech now and speak text the user cannot talk over. */
    interruptAndSpeak(text: string): Promise<void>;
}
