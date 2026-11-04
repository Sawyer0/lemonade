import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from '@lemonade/core';
import { AppError } from '@lemonade/core';
import { NHTSAService, NHTSA_RECALLS_BASE_URL, NHTSA_VPIC_BASE_URL } from '../NHTSAService';
import recalls from './fixtures/recalls-honda-accord-2003.json';
import decodedVin from './fixtures/decodevinvalues-1HGCM82633A004352.json';

/** Responses recorded from api.nhtsa.gov and vpic.nhtsa.dot.gov (Nov 2026). */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger;

function serve(routes: Record<string, unknown>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const match = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
        return match
            ? new Response(JSON.stringify(match[1]), { status: 200 })
            : new Response('{"message":"Missing Authentication Token"}', { status: 403 });
    });
}

describe('NHTSAService against recorded NHTSA responses', () => {
    afterEach(() => vi.restoreAllMocks());

    it('parses every recorded recall for a 2003 Honda Accord', async () => {
        const fetchSpy = serve({ [`${NHTSA_RECALLS_BASE_URL}/recalls/recallsByVehicle`]: recalls });
        const result = await new NHTSAService(logger).checkRecalls(2003, 'HONDA', 'Accord');

        expect(result).toHaveLength(recalls.Count);
        expect(result[0].Component).toBe('AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE');
        expect(String(fetchSpy.mock.calls[0][0])).toContain('make=HONDA&model=Accord&modelYear=2003');
    });

    it('validates and decodes a VIN through vPIC, not api.nhtsa.gov', async () => {
        const fetchSpy = serve({ [`${NHTSA_VPIC_BASE_URL}/vehicles/DecodeVinValues/`]: decodedVin });
        const service = new NHTSAService(logger);

        expect(await service.validateVin('1HGCM82633A004352')).toBe(true);
        expect(await service.getVehicleSpecs('1HGCM82633A004352')).toEqual({
            year: 2003,
            make: 'HONDA',
            model: 'Accord',
            engine: '3.0L V-Shaped Gasoline',
            trim: 'EX-V6',
        });
        expect(fetchSpy.mock.calls.every(([url]) => String(url).startsWith(NHTSA_VPIC_BASE_URL))).toBe(true);
    });

    it('rejects a VIN vPIC cannot decode and reports outages', async () => {
        const undecodable = { Results: [{ ...decodedVin.Results[0], ErrorCode: '11', Make: '', Model: '' }] };
        serve({ [`${NHTSA_VPIC_BASE_URL}/vehicles/DecodeVinValues/`]: undecodable });
        const service = new NHTSAService(logger);
        expect(await service.validateVin('1HGCM82633A00435X')).toBe(false);
        await expect(service.getVehicleSpecs('1HGCM82633A00435X')).rejects.toThrow('could not be decoded');

        vi.restoreAllMocks();
        serve({});
        await expect(service.getVehicleSpecs('1HGCM82633A004352')).rejects.toBeInstanceOf(AppError);
        expect(await service.validateVin('1HGCM82633A004352')).toBe(false);
    });
});
