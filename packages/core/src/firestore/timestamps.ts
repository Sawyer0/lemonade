/** Anything with a `toDate()`: Firestore Timestamps from both the web and Admin SDKs. */
interface DateConvertible {
    toDate(): Date;
}

function isDateConvertible(value: object): value is DateConvertible {
    return typeof (value as Partial<DateConvertible>).toDate === 'function';
}

/**
 * Deep-copies Firestore data, turning every Timestamp into a Date. Dates and
 * primitives pass through unchanged, so already-converted data is safe to pass again.
 */
export function convertTimestamps<T>(value: T): T {
    if (value === null || typeof value !== 'object' || value instanceof Date) return value;
    if (isDateConvertible(value)) return value.toDate() as T;
    if (Array.isArray(value)) return value.map((item) => convertTimestamps(item)) as T;

    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        copy[key] = convertTimestamps(item);
    }
    return copy as T;
}
