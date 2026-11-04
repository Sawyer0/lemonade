import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStripe, getProPriceId } from './stripe';
import { CONFIG } from './config';
import { ErrorCode, ILogger } from '@lemonade/core';
import type { CreateCheckoutSessionResponseDTO } from '@lemonade/core';
import { container } from './infrastructure/di/container';
import { TYPES } from './infrastructure/di/types';

const db = getFirestore();
const logger = container.get<ILogger>(TYPES.Logger);

export const createCheckoutSession = onCall(async (request): Promise<CreateCheckoutSessionResponseDTO> => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', ErrorCode.UNAUTHORIZED);
    }

    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    try {
        const priceId = await getProPriceId();

        const session = await getStripe().checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            customer_email: userEmail,
            client_reference_id: userId,
            metadata: {
                userId: userId,
            },
            success_url: `${CONFIG.APP_URL}/garage?success=true`,
            cancel_url: `${CONFIG.APP_URL}/garage?canceled=true`,
        });

        if (!session.url) {
            throw new HttpsError('internal', ErrorCode.STRIPE_ERROR, 'Failed to create Stripe session URL');
        }

        return { url: session.url };
    } catch (error) {
        logger.error('Stripe Checkout Error', error as Error);
        // We wrap the internal error but expose a standard code to the client
        throw new HttpsError('internal', ErrorCode.STRIPE_ERROR);
    }
});

export const stripeWebhook = onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = CONFIG.STRIPE.WEBHOOK_SECRET;

    // Fail closed: an unsigned body could otherwise upgrade any user to Pro.
    if (!endpointSecret) {
        logger.error('STRIPE_WEBHOOK_SECRET is not set; rejecting webhook');
        res.status(500).send('Webhook not configured');
        return;
    }
    if (!sig) {
        res.status(400).send('Missing stripe-signature header');
        return;
    }

    let event;

    try {
        event = getStripe().webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
        logger.error(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`, err as Error);
        res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        return;
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.client_reference_id || session.metadata?.userId;

                if (userId) {
                    logger.info(`Upgrading user ${userId} to PRO`);
                    await db.collection('users').doc(userId).set(
                        {
                            tier: 'pro',
                            subscriptionId: session.subscription,
                            stripeCustomerId: session.customer,
                            updatedAt: new Date(),
                        },
                        { merge: true },
                    );
                }
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                logger.info(`Subscription deleted: ${subscription.id}`);
                break;
            }
        }
    } catch (error) {
        logger.error('Error processing webhook', error as Error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json({ received: true });
});
