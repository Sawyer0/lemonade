import { describe, it, expect } from 'vitest';
import { SOURCE_LICENSES, checkLicenseManifest, sourceLicenseById } from '../licenses';

describe('license manifest', () => {
    it('passes its own check: no problems', () => {
        expect(checkLicenseManifest()).toEqual([]);
    });

    it('records a license, an SPDX id, a status and a note for every source', () => {
        expect(SOURCE_LICENSES.length).toBeGreaterThan(0);
        for (const entry of SOURCE_LICENSES) {
            expect(entry.license.length).toBeGreaterThan(0);
            expect(entry.spdxId.length).toBeGreaterThan(0);
            expect(entry.note.length).toBeGreaterThan(0);
            expect(entry.verifiedAt.length).toBeGreaterThan(0);
            expect(() => new URL(entry.sourceUrl)).not.toThrow();
        }
    });

    it('has unique source ids', () => {
        const ids = SOURCE_LICENSES.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('venders nothing but the repo’s own seed graph', () => {
        const vendored = SOURCE_LICENSES.filter((entry) => entry.status === 'vendored');
        expect(vendored.map((entry) => entry.id)).toEqual(['lemonade-seed']);
    });

    it('keeps the GPL source and the J2012 text out of shipped code', () => {
        expect(sourceLicenseById('python-obd')?.status).toBe('excluded');
        expect(sourceLicenseById('dtc-database')?.status).toBe('not-vendored');
        expect(sourceLicenseById('sae-j2012')?.status).toBe('not-vendored');
        expect(sourceLicenseById('sae-j1939-digital-annex')?.status).toBe('not-vendored');
    });

    it('looks sources up by id and reports unknown ids as missing', () => {
        expect(sourceLicenseById('opendbc')?.license).toBe('MIT License');
        expect(sourceLicenseById('no-such-source')).toBeUndefined();
    });
});
