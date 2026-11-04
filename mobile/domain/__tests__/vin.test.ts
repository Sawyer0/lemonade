import { extractVin } from '../vin';

describe('extractVin', () => {
    it('returns a clean 17-character VIN', () => {
        expect(extractVin('1HGCM82633A004352')).toBe('1HGCM82633A004352');
    });

    it('drops an import prefix and surrounding whitespace', () => {
        expect(extractVin(' I1HGCM82633A004352 ')).toBe('1HGCM82633A004352');
    });

    it('uppercases scanned text', () => {
        expect(extractVin('1hgcm82633a004352')).toBe('1HGCM82633A004352');
    });

    it('rejects text that is too short or uses I, O or Q', () => {
        expect(extractVin('1HGCM82633A00435')).toBeNull();
        expect(extractVin('1HGCM82633AOO4352')).toBeNull();
        expect(extractVin('')).toBeNull();
        expect(extractVin(undefined)).toBeNull();
    });
});
