import {
    MobileMemoryAdapter,
    MobileNHTSAAdapter,
    MobileSearchAdapter,
    MobileVectorAdapter,
    MobileVisionAdapter,
} from '../MobileServiceAdapters';
import { auth } from '../../infrastructure/firebase/config';

jest.mock('../../infrastructure/firebase/config', () => ({
    auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('id-token') } },
    db: {},
}));
jest.mock('../../constants/config', () => ({ CONFIG: { API: { BASE_URL: 'https://api.test' } } }));

const fetchMock = jest.fn();
global.fetch = fetchMock;

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

function lastRequest() {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
    const headers = new Headers(init.headers);
    return { url, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
}

describe('mobile service adapters', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(jsonResponse({ results: [{ id: 'r1' }] }));
    });

    it('sends the Firebase ID token with vector searches', async () => {
        await expect(new MobileVectorAdapter().search('squeal', 3)).resolves.toEqual([{ id: 'r1' }]);
        const { url, headers, body } = lastRequest();
        expect(url).toBe('https://api.test/api/vector');
        expect(headers.get('Authorization')).toBe('Bearer id-token');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(body).toEqual({ action: 'search', query: 'squeal', limit: 3 });
    });

    it('authorizes memory, search and analysis trigger calls', async () => {
        await new MobileMemoryAdapter().search('brakes');
        expect(lastRequest().headers.get('Authorization')).toBe('Bearer id-token');

        await new MobileSearchAdapter().search({ query: 'p0420' } as Parameters<MobileSearchAdapter['search']>[0]);
        expect(lastRequest().url).toBe('https://api.test/api/search');
        expect(lastRequest().headers.get('Authorization')).toBe('Bearer id-token');

        await new MobileVisionAdapter().analyzeUploadedVideo('gs://v.mp4', '{}', undefined, undefined, 's1');
        expect(lastRequest()).toMatchObject({
            url: 'https://api.test/api/analysis/trigger',
            body: { sessionId: 's1' },
        });
        expect(lastRequest().headers.get('Authorization')).toBe('Bearer id-token');
    });

    it('unwraps recalls and encodes the query', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ recalls: [{ campaignNumber: '1' }] }));
        await expect(new MobileNHTSAAdapter().checkRecalls(2019, 'Land Rover', 'Range Rover')).resolves.toEqual([
            { campaignNumber: '1' },
        ]);
        expect(lastRequest().url).toBe(
            'https://api.test/api/nhtsa/recalls?year=2019&make=Land+Rover&model=Range+Rover',
        );
    });

    it('returns empty results when signed out instead of calling the API', async () => {
        const original = auth.currentUser;
        Object.assign(auth, { currentUser: null });
        await expect(new MobileVectorAdapter().search('x')).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        Object.assign(auth, { currentUser: original });
    });
});
