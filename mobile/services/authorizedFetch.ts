import { auth } from '@mobile/infrastructure/firebase/config';
import { CONFIG } from '../constants/config';

/**
 * Calls the Lemonade API with the signed-in user's Firebase ID token, the
 * same way useVehicle does. Throws when nobody is signed in, because every
 * API route the mobile adapters call verifies the token.
 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in required');

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
    if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    return fetch(`${CONFIG.API.BASE_URL}${path}`, { ...init, headers });
}

/** POSTs a JSON body with authorizedFetch. */
export function postJson(path: string, body: unknown): Promise<Response> {
    return authorizedFetch(path, { method: 'POST', body: JSON.stringify(body) });
}
