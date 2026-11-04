import { Timestamp } from 'firebase-admin/firestore';

// Type guard for Firestore Timestamp
function isTimestamp(value: unknown): value is Timestamp {
    return (
        value instanceof Timestamp ||
        (typeof value === 'object' &&
            value !== null &&
            typeof (value as Timestamp).toDate === 'function' &&
            typeof (value as Timestamp).seconds === 'number' &&
            typeof (value as Timestamp).nanoseconds === 'number')
    );
}

export function convertTimestamps<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) {
        return obj;
    }

    if (isTimestamp(obj)) {
        return obj.toDate() as T;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => convertTimestamps(item)) as T;
    }

    const newObj: { [key: string]: unknown } = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = convertTimestamps((obj as { [key: string]: unknown })[key]);
        }
    }
    return newObj as T;
}
