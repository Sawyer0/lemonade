import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@lemonade/infrastructure';
import { CONFIG } from '@/infrastructure/config';

import { createErrorResponse } from '@/application/http/validateRequest';
import { AppError, ErrorCode } from '@lemonade/core';
import type { BillingPortalResponseDTO } from '@lemonade/core';
import { withContext } from '@/application/http/withContext';

const getStripe = () => {
    const key = CONFIG.PAYMENTS.STRIPE_SECRET_KEY;
    if (!key) {
        throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'STRIPE_SECRET_KEY is missing');
    }
    return new Stripe(key, {
        apiVersion: '2024-11-20.acacia' as unknown as Stripe.LatestApiVersion,
    });
};

// Unused imports related to DI removed

export const POST = withContext(async (req: Request) => {
    try {
        // 1. Get User ID from Middleware Header
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Unauthorized', 401);
        }

        // 2. Get User from Firestore to find Stripe Customer ID
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData || !userData.stripeCustomerId) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'No subscription found', 404);
        }

        // 3. Create Portal Session
        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
            customer: userData.stripeCustomerId,
            return_url: `${CONFIG.PAYMENTS.APP_URL}/garage`,
        });

        return NextResponse.json({ url: session.url } satisfies BillingPortalResponseDTO);
    } catch (error) {
        return createErrorResponse(error);
    }
});
