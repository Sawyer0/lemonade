import { z } from 'zod';

export const CreateCheckoutSessionRequestSchema = z.object({
    priceId: z.string().optional(),
});

export type CreateCheckoutSessionRequestDTO = z.infer<typeof CreateCheckoutSessionRequestSchema>;

export const CreateCheckoutSessionResponseSchema = z.object({
    url: z.string().url(),
});

export type CreateCheckoutSessionResponseDTO = z.infer<typeof CreateCheckoutSessionResponseSchema>;

export const BillingPortalRequestSchema = z.object({
    returnUrl: z.string().url().optional(),
});

export type BillingPortalRequestDTO = z.infer<typeof BillingPortalRequestSchema>;

export const BillingPortalResponseSchema = z.object({
    url: z.string().url(),
});

export type BillingPortalResponseDTO = z.infer<typeof BillingPortalResponseSchema>;
