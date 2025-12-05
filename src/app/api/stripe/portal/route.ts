import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/infrastructure/firebase/admin';

const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        console.error('STRIPE_SECRET_KEY is missing');
        throw new Error('STRIPE_SECRET_KEY is missing');
    }
    return new Stripe(key, {
        apiVersion: '2024-11-20.acacia' as unknown as Stripe.LatestApiVersion,
    });
};

export async function POST(req: Request) {
    try {
        // 1. Get User ID from Middleware Header
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Get User from Firestore to find Stripe Customer ID
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData || !userData.stripeCustomerId) {
            return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
        }

        // 3. Create Portal Session
        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
            customer: userData.stripeCustomerId,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/garage`,
        });

        return NextResponse.json({ url: session.url });

    } catch (error) {
        console.error('Stripe Portal Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
