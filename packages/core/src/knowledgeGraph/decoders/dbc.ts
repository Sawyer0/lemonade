import { z } from 'zod';

// --- DBC text parsing (LM-38) ---
// A cantools-style reader for opendbc DBC files. The DBC files themselves
// are a separate data asset (MIT, commaai/opendbc) loaded at runtime; none
// are vendored here. This module only reads DBC text, so a
// vehicle-specific DBC is fetched under its own terms when needed. Only
// plain (non-multiplexed) signals are supported: a multiplexed signal is
// rejected by name instead of being silently misread.

export const DbcSignalSchema = z
    .object({
        name: z.string().min(1),
        startBit: z.number().int().min(0),
        lengthBits: z.number().int().min(1).max(64),
        littleEndian: z.boolean(),
        signed: z.boolean(),
        factor: z.number(),
        offset: z.number(),
        minimum: z.number(),
        maximum: z.number(),
        unit: z.string(),
        receivers: z.array(z.string().min(1)),
    })
    .strict();
export type DbcSignal = z.infer<typeof DbcSignalSchema>;

export const DbcMessageSchema = z
    .object({
        id: z.number().int().min(0),
        name: z.string().min(1),
        dlc: z.number().int().min(0).max(8),
        transmitter: z.string().min(1),
        signals: z.array(DbcSignalSchema),
    })
    .strict();
export type DbcMessage = z.infer<typeof DbcMessageSchema>;

export interface DecodedSignal {
    /** Raw integer straight out of the frame, before factor and offset. */
    rawValue: number;
    /** Physical value: raw * factor + offset. */
    value: number;
    unit: string;
}

const MESSAGE_LINE = /^BO_\s+(\d+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\d+)\s+(\S+)\s*$/;
const SIGNAL_LINE =
    /^\s*SG_\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([-\d.eE+]+),([-\d.eE+]+)\)\s*\[([-\d.eE+]+)\|([-\d.eE+]+)\]\s*"([^"]*)"\s*(.*)$/;
const MULTIPLEXED_SIGNAL_LINE = /^\s*SG_\s+([A-Za-z_][A-Za-z0-9_]*)\s+[mM]\S*\s*:/;

function parseNumber(text: string, label: string): number {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
        throw new Error(`DBC value is not a number for ${label}: '${text}'`);
    }
    return parsed;
}

/** Extracts one payload bit: `bitIndex` counts from the least significant bit of byte 0. */
function payloadBit(payload: readonly number[], bitIndex: number): number {
    const byte = payload[Math.floor(bitIndex / 8)] ?? 0;
    return (byte >> (bitIndex % 8)) & 1;
}

/**
 * Extracts a signal's raw bits. Intel (little-endian) signals read
 * consecutive bits upward from the start bit; Motorola (big-endian)
 * signals read consecutive DBC bit numbers, where bit 0 is the most
 * significant bit of byte 0 and numbering runs down through each byte
 * before moving to the next.
 */
function extractRawBits(signal: DbcSignal, payload: readonly number[]): number {
    let raw = 0;
    if (signal.littleEndian) {
        for (let index = 0; index < signal.lengthBits; index += 1) {
            raw |= payloadBit(payload, signal.startBit + index) << index;
        }
        return raw;
    }
    for (let index = 0; index < signal.lengthBits; index += 1) {
        const dbcBit = signal.startBit + index;
        const lsbIndex = Math.floor(dbcBit / 8) * 8 + (7 - (dbcBit % 8));
        raw = (raw << 1) | payloadBit(payload, lsbIndex);
    }
    return raw;
}

export class DbcDatabase {
    private readonly messagesById: Map<number, DbcMessage>;
    private readonly messagesByName: Map<string, DbcMessage>;

    private constructor(messages: DbcMessage[]) {
        this.messagesById = new Map(messages.map((message) => [message.id, message]));
        this.messagesByName = new Map(messages.map((message) => [message.name, message]));
    }

    /** Parses DBC text into a database. Lines that match no known pattern are ignored; only specific malformed patterns (a duplicate message or signal, a multiplexed signal, a signal before any message, or a signal that runs past the end of its message) fail the whole parse. */
    static parse(dbcText: string): DbcDatabase {
        const messages: DbcMessage[] = [];
        let current: DbcMessage | undefined;
        const seenIds = new Set<number>();
        const seenNames = new Set<string>();
        for (const line of dbcText.split('\n')) {
            const messageMatch = MESSAGE_LINE.exec(line);
            if (messageMatch !== null) {
                const id = Number(messageMatch[1]);
                const name = messageMatch[2];
                const dlc = Number(messageMatch[3]);
                if (seenIds.has(id)) {
                    throw new Error(`DBC defines message id ${id} more than once`);
                }
                if (seenNames.has(name)) {
                    throw new Error(`DBC defines message '${name}' more than once`);
                }
                seenIds.add(id);
                seenNames.add(name);
                current = { id, name, dlc, transmitter: messageMatch[4], signals: [] };
                messages.push(current);
                continue;
            }
            const multiplexedMatch = MULTIPLEXED_SIGNAL_LINE.exec(line);
            if (multiplexedMatch !== null) {
                throw new Error(`DBC multiplexed signal '${multiplexedMatch[1]}' is not supported`);
            }
            const signalMatch = SIGNAL_LINE.exec(line);
            if (signalMatch !== null) {
                if (current === undefined) {
                    throw new Error(`DBC signal '${signalMatch[1]}' appears before any message`);
                }
                const signal = DbcSignalSchema.parse({
                    name: signalMatch[1],
                    startBit: Number(signalMatch[2]),
                    lengthBits: Number(signalMatch[3]),
                    littleEndian: signalMatch[4] === '1',
                    signed: signalMatch[5] === '-',
                    factor: parseNumber(signalMatch[6], `factor of signal '${signalMatch[1]}'`),
                    offset: parseNumber(signalMatch[7], `offset of signal '${signalMatch[1]}'`),
                    minimum: parseNumber(signalMatch[8], `minimum of signal '${signalMatch[1]}'`),
                    maximum: parseNumber(signalMatch[9], `maximum of signal '${signalMatch[1]}'`),
                    unit: signalMatch[10],
                    receivers: signalMatch[11]
                        .split(',')
                        .map((receiver) => receiver.trim())
                        .filter(Boolean),
                });
                if (signal.startBit + signal.lengthBits > current.dlc * 8) {
                    throw new Error(`DBC signal '${signal.name}' runs past the end of message '${current.name}'`);
                }
                if (current.signals.some((existing) => existing.name === signal.name)) {
                    throw new Error(`DBC message '${current.name}' defines signal '${signal.name}' more than once`);
                }
                current.signals.push(signal);
            }
        }
        if (messages.length === 0) {
            throw new Error('DBC text defines no messages');
        }
        return new DbcDatabase(messages);
    }

    allMessages(): DbcMessage[] {
        return [...this.messagesById.values()];
    }

    messageById(id: number): DbcMessage | undefined {
        return this.messagesById.get(id);
    }

    messageByName(name: string): DbcMessage | undefined {
        return this.messagesByName.get(name);
    }

    /**
     * Decodes one CAN frame: the payload bytes for a message id, into a
     * physical value per signal. An unknown id or a payload shorter than
     * the message's DLC fails instead of decoding garbage.
     */
    decode(canId: number, payload: readonly number[]): Record<string, DecodedSignal> {
        const message = this.messagesById.get(canId);
        if (message === undefined) {
            throw new Error(`DBC has no message with id ${canId}`);
        }
        if (payload.length < message.dlc) {
            throw new Error(
                `CAN frame for '${message.name}' is ${payload.length} bytes, shorter than its DLC of ${message.dlc}`,
            );
        }
        const decoded: Record<string, DecodedSignal> = {};
        for (const signal of message.signals) {
            let raw = extractRawBits(signal, payload);
            if (signal.signed && raw >= 2 ** (signal.lengthBits - 1)) {
                raw -= 2 ** signal.lengthBits;
            }
            decoded[signal.name] = { rawValue: raw, value: raw * signal.factor + signal.offset, unit: signal.unit };
        }
        return decoded;
    }
}
