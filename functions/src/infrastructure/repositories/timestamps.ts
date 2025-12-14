export function convertTimestamps(data: any): any {
    if (!data) return data;

    for (const key in data) {
        if (data[key] && typeof data[key].toDate === 'function') {
            data[key] = data[key].toDate();
        } else if (typeof data[key] === 'object' && data[key] !== null) {
            data[key] = convertTimestamps(data[key]);
        }
    }
    return data;
}