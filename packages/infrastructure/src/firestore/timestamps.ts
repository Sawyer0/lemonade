/**
 * @param obj 
 * @returns 
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const convertTimestamps = (obj: any): any => {
    if (!obj) return obj;
    if (typeof obj.toDate === 'function') return obj.toDate();
    if (Array.isArray(obj)) return obj.map(convertTimestamps);
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
