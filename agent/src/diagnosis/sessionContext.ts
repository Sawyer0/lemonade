import type { ReasoningInput } from '@lemonade/core';

export type VehicleContext = ReasoningInput['vehicleContext'];

/** Who and what a live room is about, parsed from the job and participant metadata. */
export interface SessionContext {
    sessionId: string;
    userId: string;
    vehicle: VehicleContext;
    /** The vehicle as the client sent it, passed through to analyzers that take raw context. */
    vehicleJson: string;
    /**
     * Case the session belongs to, when the client sends one in token
     * metadata. Voice transcripts are appended to this case's ledger (LM-39);
     * without it the session still runs, but nothing reaches the ledger.
     */
    caseId?: string;
}

interface ClientMetadata {
    vehicleContext?: unknown;
    userId?: unknown;
    caseId?: unknown;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A case id is only usable when it is a UUID; anything else is ignored, like other malformed metadata. */
function toCaseId(value: unknown): string | undefined {
    return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

function parseJson(raw: string | undefined): unknown {
    if (!raw) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function toVehicle(value: unknown): VehicleContext {
    const raw = typeof value === 'string' ? parseJson(value) : value;
    if (!raw || typeof raw !== 'object') return {};
    const record = raw as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : undefined);
    const year = typeof record.year === 'number' ? record.year : Number(record.year) || undefined;
    return {
        year,
        make: text('make'),
        model: text('model'),
        engine: text('engine'),
        trim: text('trim'),
        vin: text('vin'),
    };
}

/**
 * The mobile client puts `{ vehicleContext, userId }` in its token metadata
 * (see useLiveMechanicSession). Missing or malformed metadata degrades to an
 * unknown vehicle rather than failing the call.
 */
export function parseSessionContext(roomName: string, participantIdentity: string, metadata?: string): SessionContext {
    const parsed = parseJson(metadata) as ClientMetadata | undefined;
    const vehicle = toVehicle(parsed?.vehicleContext);
    return {
        sessionId: roomName,
        userId: typeof parsed?.userId === 'string' ? parsed.userId : participantIdentity,
        vehicle,
        vehicleJson: JSON.stringify(vehicle),
        caseId: toCaseId(parsed?.caseId),
    };
}

export function describeVehicle(vehicle: VehicleContext): string {
    const name = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
    return name || 'unknown vehicle';
}
