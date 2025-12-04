import { z } from 'zod';

export const VehicleSchema = z.object({
    id: z.string().uuid(),
    vin: z.string().length(17),
    userId: z.string(),
    // "Fixed Identity" (DNA)
    specs: z.object({
        year: z.number(),
        make: z.string(),
        model: z.string(),
        engine: z.string(),
        trim: z.string().optional(),
    }),
    photoUrl: z.string().url().optional(),
    activeIssuesCount: z.number().default(0),
    createdAt: z.date(),
});

export type Vehicle = z.infer<typeof VehicleSchema>;
