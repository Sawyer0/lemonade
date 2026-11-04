import Stripe from 'stripe';
import { CONFIG } from './config';

let client: Stripe | undefined;

/**
 * Lazily creates the Stripe client. The SDK throws on an empty key, so building
 * it at import time would crash every function (and deploy-time discovery)
 * whenever STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
    if (!client) {
        const key = CONFIG.STRIPE.SECRET_KEY;
        if (!key) {
            throw new Error('STRIPE_SECRET_KEY is not set');
        }
        client = new Stripe(key, {
            apiVersion: '2024-11-20.acacia' as string as Stripe.LatestApiVersion,
        });
    }
    return client;
}

/**
 * Helper to find or create the "Lemonade Pro" product.
 * In a real app, you'd probably manage this via the Stripe Dashboard,
 * but this helper ensures the code works out-of-the-box for the MVP.
 */
export async function getProPriceId(): Promise<string> {
    // 1. Search for existing product
    const products = await getStripe().products.search({
        query: "name:'Lemonade Pro' AND active:'true'",
    });

    if (products.data.length > 0) {
        const product = products.data[0];
        // Get its default price
        if (typeof product.default_price === 'string') {
            return product.default_price;
        }
        // If no default price, list prices
        const prices = await getStripe().prices.list({ product: product.id, active: true, limit: 1 });
        if (prices.data.length > 0) {
            return prices.data[0].id;
        }
    }

    // 2. Create if not found
    console.log('Creating "Lemonade Pro" product in Stripe...');
    const newProduct = await getStripe().products.create({
        name: 'Lemonade Pro',
        description: 'Unlimited AI Diagnostics & Video Analysis',
        default_price_data: {
            currency: 'usd',
            unit_amount: 2000, // $20.00
            recurring: { interval: 'month' },
        },
    });

    return newProduct.default_price as string;
}
