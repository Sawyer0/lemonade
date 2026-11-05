import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { VehicleService } from '../VehicleService';
import type { ILogger, ISessionRepository, IVehicleInfoProvider, IVehicleRepository } from '@lemonade/core';

describe('VehicleService.getHistory', () => {
    it('drops sessions that belong to another user, even on the same vehicle', async () => {
        const sessionRepo = {
            findByVehicleId: vi.fn().mockResolvedValue([
                { id: 'a', vehicleId: 'v1', userId: 'me' },
                { id: 'b', vehicleId: 'v1', userId: 'someone-else' },
            ]),
        } as unknown as ISessionRepository;
        const service = new VehicleService(
            {} as IVehicleRepository,
            sessionRepo,
            {} as IVehicleInfoProvider,
            {} as ILogger,
        );

        const history = await service.getHistory('v1', 'me');

        expect(sessionRepo.findByVehicleId).toHaveBeenCalledWith('v1');
        expect(history.map((s) => s.id)).toEqual(['a']);
    });
});
