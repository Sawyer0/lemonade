import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Serves NHTSA responses recorded from api.nhtsa.gov and vpic.nhtsa.dot.gov, so the
 * smoke test runs the real NHTSAService over HTTP without depending on NHTSA.
 * Paths match both hosts: /recalls/... (recalls API) and /api/vehicles/... (vPIC).
 */
const FIXTURES = path.resolve(__dirname, '../../packages/infrastructure/src/external/__tests__/fixtures');
const read = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');

export const FIXTURE_VIN = '1HGCM82633A004352';
export const FIXTURE_VEHICLE = { year: 2003, make: 'HONDA', model: 'Accord' };

const NO_RECALLS = JSON.stringify({ Count: 0, Message: 'Results returned successfully', results: [] });

export function startNhtsaFixtureServer(port: number): Promise<Server> {
    const recalls = read('recalls-honda-accord-2003.json');
    const decoded = read('decodevinvalues-1HGCM82633A004352.json');

    const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://fixture');
        let body: string | null = null;

        if (url.pathname === '/recalls/recallsByVehicle') {
            const isFixtureVehicle =
                url.searchParams.get('make')?.toUpperCase() === FIXTURE_VEHICLE.make &&
                url.searchParams.get('model')?.toLowerCase() === FIXTURE_VEHICLE.model.toLowerCase() &&
                url.searchParams.get('modelYear') === String(FIXTURE_VEHICLE.year);
            body = isFixtureVehicle ? recalls : NO_RECALLS;
        } else if (url.pathname === `/api/vehicles/DecodeVinValues/${FIXTURE_VIN}`) {
            body = decoded;
        }

        res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
        res.end(body ?? '{"message":"not recorded"}');
    });

    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
