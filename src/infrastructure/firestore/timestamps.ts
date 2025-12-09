/**
 * Recursively converts Firestore Timestamps to JavaScript Dates in an object.
 * Handles nested objects and arrays.
 * 
 * @param obj The object to convert
 * @returns The object with Dates instead of Timestamps
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const convertTimestamps = (obj: any): any => {
    if (!obj) return obj;
    // Check for Firestore Timestamp-like object (has toDate method)
    if (typeof obj.toDate === 'function') return obj.toDate();
    // Handle Arrays
    if (Array.isArray(obj)) return obj.map(convertTimestamps);
    // Handle Objects
    if (typeof obj === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = {};
        for (const key in obj) {
            result[key] = convertTimestamps(obj[key]);
        }
        return result;
    }
    return obj;
};
