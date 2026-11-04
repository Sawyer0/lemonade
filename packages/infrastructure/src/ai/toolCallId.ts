/** A client-side id for a model tool call, unique enough to pair a call with its result. */
export function newToolCallId(): string {
    return 'call_' + Math.random().toString(36).substring(2, 11);
}
