import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { stripe, getProPriceId } from './stripe';
import { CONFIG } from './config';
import { ErrorCode } from '@core/errors';

const db = getFirestore();

export const createCheckoutSession = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', ErrorCode.UNAUTHORIZED);
    }

    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    try {
        const priceId = await getProPriceId();

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            customer_email: userEmail,
            client_reference_id: userId,
            metadata: {
                userId: userId,
            },
            success_url: `${CONFIG.APP_URL}/garage?success=true`,
            cancel_url: `${CONFIG.APP_URL}/garage?canceled=true`,
        });

        return { url: session.url };
    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        // We wrap the internal error but expose a standard code to the client
        throw new HttpsError('internal', ErrorCode.STRIPE_ERROR);
    }
});

export const stripeWebhook = onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        if (endpointSecret && sig) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        } else {
            event = req.body;
        }
    } catch (err) {
        console.error(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`);
        return;
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.client_reference_id || session.metadata?.userId;

                if (userId) {
                    console.log(`Upgrading user ${userId} to PRO`);
                    await db.collection('users').doc(userId).set({
                        tier: 'pro',
                        subscriptionId: session.subscription,
                        updatedAt: new Date(),
                    }, { merge: true });
                }
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log(`Subscription deleted: ${subscription.id}`);
                break;
            }
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json({ received: true });
});
