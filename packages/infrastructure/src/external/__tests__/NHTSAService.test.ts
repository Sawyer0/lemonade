import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NHTSAService } from '../NHTSAService';
import type { ILogger } from '@lemonade/core';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockLogger: ILogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

describe('NHTSAService', () => {
    let service: NHTSAService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new NHTSAService(mockLogger);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('checkRecalls', () => {
        it('should return recalls for valid vehicle', async () => {
            const mockRecalls = {
                Count: 2,
                results: [
                    {
                        ReportReceivedDate: '2023-01-15',
                        Component: 'BRAKES',
                        Summary: 'Brake failure risk',
                        Consequence: 'Increased risk of crash',
                        Remedy: 'Replace brake pads',
                        Notes: 'Check immediately',
                        NHTSACampaignNumber: '23V-001',
                        Manufacturer: 'Honda',
                        parkIt: false,
                        parkOutSide: false,
                        overTheAirUpdate: false,
                        NHTSAActionNumber: 'ACTION-001',
                        ModelYear: '2020',
                        Make: 'Honda',
                        Model: 'Civic',
                    },
                    {
                        ReportReceivedDate: '2023-06-20',
                        Component: 'AIRBAGS',
                        Summary: 'Airbag deployment issue',
                        Consequence: 'Airbag may not deploy',
                        Remedy: 'Replace airbag module',
                        Notes: '',
                        NHTSACampaignNumber: '23V-002',
                        Manufacturer: 'Honda',
                        parkIt: true,
                        parkOutSide: false,
                        overTheAirUpdate: false,
                        NHTSAActionNumber: 'ACTION-002',
                        ModelYear: '2020',
                        Make: 'Honda',
                        Model: 'Civic',
                    },
                ],
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockRecalls),
            });

            const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

            expect(recalls).toHaveLength(2);
            expect(recalls[0].Component).toBe('BRAKES');
            expect(recalls[1].parkIt).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Found 2 recalls'));
        });

        it('should return empty array when no recalls found', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ Count: 0, results: [] }),
            });

            const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

            expect(recalls).toEqual([]);
        });

        describe('API Failures', () => {
            it('should return empty array on 500 server error', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error',
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
                expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('API Error'), undefined);
            });

            it('should return empty array on 503 service unavailable', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 503,
                    statusText: 'Service Unavailable',
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should return empty array on 429 rate limit', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests',
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should return empty array on network timeout', async () => {
                mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Failed to fetch recalls'),
                    expect.any(Error),
                );
            });

            it('should return empty array on DNS resolution failure', async () => {
                mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should return empty array on connection refused', async () => {
                mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });
        });

        describe('Malformed Responses', () => {
            it('should return empty array when response is not JSON', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.reject(new SyntaxError('Unexpected token')),
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should return empty array when Count field is missing', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ results: [] }),
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should return empty array when results is not an array', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ Count: 1, results: 'not-an-array' }),
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should handle null response body', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(null),
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                expect(recalls).toEqual([]);
            });

            it('should handle partial recall data with missing fields', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            Count: 1,
                            results: [
                                {
                                    // Missing most fields
                                    Component: 'BRAKES',
                                },
                            ],
                        }),
                });

                const recalls = await service.checkRecalls(2020, 'Honda', 'Civic');

                // Should still work - Zod schema uses defaults
                expect(recalls).toHaveLength(1);
                expect(recalls[0].Component).toBe('BRAKES');
                expect(recalls[0].Summary).toBe('');
            });
        });

        describe('Input Edge Cases', () => {
            it('should encode special characters in make/model', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ Count: 0, results: [] }),
                });

                await service.checkRecalls(2020, 'Mercedes-Benz', 'C-Class AMG');

                expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('Mercedes-Benz'));
                expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('C-Class%20AMG'));
            });

            it('should handle empty make', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ Count: 0, results: [] }),
                });

                const recalls = await service.checkRecalls(2020, '', 'Civic');

                expect(recalls).toEqual([]);
                expect(mockFetch).toHaveBeenCalled();
            });

            it('should handle empty model', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ Count: 0, results: [] }),
                });

                const recalls = await service.checkRecalls(2020, 'Honda', '');

                expect(recalls).toEqual([]);
            });

            it('should handle very old vehicle year', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ Count: 0, results: [] }),
                });

                const recalls = await service.checkRecalls(1950, 'Ford', 'Model T');

                expect(recalls).toEqual([]);
                expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('modelYear=1950'));
            });

            it('should handle future vehicle year', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ Count: 0, results: [] }),
                });

                const recalls = await service.checkRecalls(2030, 'Tesla', 'Model S');

                expect(recalls).toEqual([]);
                expect(mockFetch).toHaveBeenCalled();
            });
        });
    });

    describe('checkRecallsStrict (LM-18)', () => {
        it('returns recalls on success, like checkRecalls', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        Count: 1,
                        results: [
                            {
                                ReportReceivedDate: '2023-01-15',
                                Component: 'BRAKES',
                                Summary: 'Brake failure risk',
                                Consequence: 'Increased risk of crash',
                                Remedy: 'Replace brake pads',
                                Notes: '',
                                NHTSACampaignNumber: '23V-001',
                                Manufacturer: 'Honda',
                                ModelYear: '2020',
                                Make: 'Honda',
                                Model: 'Civic',
                            },
                        ],
                    }),
            });

            const recalls = await service.checkRecallsStrict(2020, 'Honda', 'Civic');

            expect(recalls).toHaveLength(1);
            expect(recalls[0].Component).toBe('BRAKES');
        });

        it('throws on a 500 instead of returning an empty list', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            await expect(service.checkRecallsStrict(2020, 'Honda', 'Civic')).rejects.toThrow(
                'NHTSA recalls lookup failed: 500',
            );
            // The forgiving lookup still returns [] for the same failure.
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });
            expect(await service.checkRecalls(2020, 'Honda', 'Civic')).toEqual([]);
        });

        it('throws on a network failure instead of returning an empty list', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

            await expect(service.checkRecallsStrict(2020, 'Honda', 'Civic')).rejects.toThrow('Network timeout');
        });

        it('returns an empty list when the API answers with no recalls', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ Count: 0, results: [] }),
            });

            expect(await service.checkRecallsStrict(2020, 'Honda', 'Civic')).toEqual([]);
        });
    });

    describe('validateVin', () => {
        it('should return true for valid VIN', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        Results: [{ ErrorCode: '0' }],
                    }),
            });

            const isValid = await service.validateVin('1HGBH41JXMN109186');

            expect(isValid).toBe(true);
        });

        it('should return false for invalid VIN', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        Results: [{ ErrorCode: '1' }],
                    }),
            });

            const isValid = await service.validateVin('INVALID-VIN');

            expect(isValid).toBe(false);
        });

        it('should return false on API error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const isValid = await service.validateVin('1HGBH41JXMN109186');

            expect(isValid).toBe(false);
        });

        it('should return false on network error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const isValid = await service.validateVin('1HGBH41JXMN109186');

            expect(isValid).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('VIN check failed'),
                expect.any(Error),
            );
        });

        it('should return false when Results is empty', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ Results: [] }),
            });

            const isValid = await service.validateVin('1HGBH41JXMN109186');

            expect(isValid).toBe(false);
        });

        it('should return false when Results is null', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ Results: null }),
            });

            const isValid = await service.validateVin('1HGBH41JXMN109186');

            expect(isValid).toBe(false);
        });

        it('should return false on malformed JSON', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.reject(new SyntaxError('Invalid JSON')),
            });

            const isValid = await service.validateVin('1HGBH41JXMN109186');

            expect(isValid).toBe(false);
        });
    });
});
