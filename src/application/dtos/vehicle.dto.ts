import { z } from 'zod';
import { VehicleSchema } from '@/core/types/models';

// --- Vehicle Scan Request ---
export const VehicleScanRequestSchema = z.object({
    vin: z.string().length(17, 'VIN must be exactly 17 characters'),
    userId: z.string().min(1),
});

export type VehicleScanRequestDTO = z.infer<typeof VehicleScanRequestSchema>;

// --- Vehicle List Response ---
export const VehicleListResponseSchema = z.object({
    data: z.array(VehicleSchema),
});

export type VehicleListResponseDTO = z.infer<typeof VehicleListResponseSchema>;

// --- Vehicle Scan Response ---
export const VehicleScanResponseSchema = z.object({
    sessionId: z.string().uuid(),
    message: z.string(),
});

export type VehicleScanResponseDTO = z.infer<typeof VehicleScanResponseSchema>;
