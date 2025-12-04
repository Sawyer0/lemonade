import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY is missing in environment variables.');
}

export const stripe = new Stripe(STRIPE_SECRET_KEY || '', {
    apiVersion: '2024-11-20.acacia' as any,
});

/**
 * Helper to find or create the "Lemonade Pro" product.
 * In a real app, you'd probably manage this via the Stripe Dashboard,
 * but this helper ensures the code works out-of-the-box for the MVP.
 */
export async function getProPriceId(): Promise<string> {
    // 1. Search for existing product
    const products = await stripe.products.search({
        query: "name:'Lemonade Pro' AND active:'true'",
    });

    if (products.data.length > 0) {
        const product = products.data[0];
        // Get its default price
        if (typeof product.default_price === 'string') {
            return product.default_price;
        }
        // If no default price, list prices
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
        if (prices.data.length > 0) {
            return prices.data[0].id;
        }
    }

    // 2. Create if not found
    console.log('Creating "Lemonade Pro" product in Stripe...');
    const newProduct = await stripe.products.create({
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
