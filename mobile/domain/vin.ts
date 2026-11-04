/** VINs are 17 characters of A-Z and 0-9, never I, O or Q (ISO 3779). */
const VIN_PATTERN = /[A-HJ-NPR-Z0-9]{17}/g;

/**
 * Pulls a VIN out of raw barcode text. Door-jamb and windshield barcodes often
 * add a prefix such as "I" (import) or extra data, so take the last valid
 * 17-character run.
 */
export function extractVin(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const matches = raw.toUpperCase().replace(/\s+/g, '').match(VIN_PATTERN);
    return matches ? matches[matches.length - 1] : null;
}

/** True when the whole string is a well-formed VIN (case-insensitive). */
export function isValidVin(vin: string): boolean {
    return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}
