import { z } from 'zod';
import { VehicleSchema, DiagnosticSessionSchema } from '@lemonade/core';

export const VehicleScanRequestSchema = z.object({
    vin: z.string().length(17, 'VIN must be exactly 17 characters'),
    userId: z.string().min(1),
});

export type VehicleScanRequestDTO = z.infer<typeof VehicleScanRequestSchema>;

export const VehicleListResponseSchema = z.object({
    data: z.array(VehicleSchema),
});

export type VehicleListResponseDTO = z.infer<typeof VehicleListResponseSchema>;

export const VehicleScanResponseSchema = z.object({
    success: z.boolean(),
    data: VehicleSchema,
});

export type VehicleScanResponseDTO = z.infer<typeof VehicleScanResponseSchema>;

export const VehicleHistoryResponseSchema = z.object({
    data: z.object({
        vehicle: VehicleSchema,
        sessions: z.array(DiagnosticSessionSchema),
    }),
});

export type VehicleHistoryResponseDTO = z.infer<typeof VehicleHistoryResponseSchema>;
