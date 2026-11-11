import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

/**
 * Firestore rules tests for the LM-31 shop-scoped memory collections.
 * Runs inside the emulator smoke job (see .github/workflows/ci.yml): the
 * Firestore emulator is already up, and it loads firestore.rules at
 * startup, so this file deliberately does NOT pass rules to
 * initializeTestEnvironment. (The emulator's :securityRules PUT endpoint
 * returns 500 "http2 exception" for any rules, even a minimal allow-all
 * file, so pushing rules from the test is not possible here.) Every test
 * uses a fresh shop id, and nothing here calls clearFirestore(), so the
 * app smoke tests sharing the emulator are unaffected.
 */
const PROJECT_ID = 'demo-lemonade';
const VIN = '19XFB2F59FE000000';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            host: '127.0.0.1',
            port: 8080,
        },
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

function shopId(): string {
    return `shop-${randomUUID()}`;
}

/** Seeds a shop with an owner and one tech member, bypassing the rules. */
async function seedShop(id: string, ownerUid: string, techUid: string): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const firestore = context.firestore();
        await setDoc(doc(firestore, 'shops', id), { ownerId: ownerUid });
        await setDoc(doc(firestore, 'shops', id, 'members', ownerUid), { role: 'owner' });
        await setDoc(doc(firestore, 'shops', id, 'members', techUid), { role: 'tech' });
    });
}

describe('shop-scoped memory rules (LM-31)', () => {
    it('lets the owner bootstrap a shop and blocks non-members from reading it', async () => {
        const id = shopId();
        const owner = `owner-${randomUUID()}`;
        const stranger = `stranger-${randomUUID()}`;
        const ownerContext = testEnv.authenticatedContext(owner);
        await assertSucceeds(setDoc(doc(ownerContext.firestore(), 'shops', id), { ownerId: owner }));
        await assertSucceeds(setDoc(doc(ownerContext.firestore(), 'shops', id, 'members', owner), { role: 'owner' }));
        await assertSucceeds(getDoc(doc(ownerContext.firestore(), 'shops', id)));
        await assertFails(getDoc(doc(testEnv.authenticatedContext(stranger).firestore(), 'shops', id)));
    });

    it('keeps a vehicle record inside its own shop: the same VIN at another shop sees nothing', async () => {
        const first = shopId();
        const second = shopId();
        const ownerA = `owner-${randomUUID()}`;
        const techA = `tech-${randomUUID()}`;
        const ownerB = `owner-${randomUUID()}`;
        await seedShop(first, ownerA, techA);
        await seedShop(second, ownerB, `tech-${randomUUID()}`);

        const record = { shopId: first, vin: VIN, summary: '', claims: [] };
        await assertSucceeds(
            setDoc(doc(testEnv.authenticatedContext(techA).firestore(), 'shops', first, 'vehicleRecords', VIN), record),
        );
        await assertSucceeds(
            getDoc(doc(testEnv.authenticatedContext(techA).firestore(), 'shops', first, 'vehicleRecords', VIN)),
        );
        await assertFails(
            getDoc(doc(testEnv.authenticatedContext(ownerB).firestore(), 'shops', first, 'vehicleRecords', VIN)),
        );
        // The same VIN at another shop is a different record: ownerB may read
        // their own shop's slot, but there is no record there to see. A read
        // of a permitted-but-missing document resolves successfully, so the
        // assertion is on absence, not on a rules denial.
        const missing = await getDoc(
            doc(testEnv.authenticatedContext(ownerB).firestore(), 'shops', second, 'vehicleRecords', VIN),
        );
        expect(missing.exists()).toBe(false);
    });

    it('lets only the owner write shop settings', async () => {
        const id = shopId();
        const owner = `owner-${randomUUID()}`;
        const tech = `tech-${randomUUID()}`;
        await seedShop(id, owner, tech);
        const settings = { shopId: id, laborRateCents: 12000, currency: 'USD', suppliers: [] };
        await assertFails(
            setDoc(doc(testEnv.authenticatedContext(tech).firestore(), 'shops', id, 'settings', 'business'), settings),
        );
        await assertSucceeds(
            setDoc(doc(testEnv.authenticatedContext(owner).firestore(), 'shops', id, 'settings', 'business'), settings),
        );
        await assertSucceeds(
            getDoc(doc(testEnv.authenticatedContext(tech).firestore(), 'shops', id, 'settings', 'business')),
        );
    });

    it('never lets a member delete a vehicle record', async () => {
        const id = shopId();
        const owner = `owner-${randomUUID()}`;
        const tech = `tech-${randomUUID()}`;
        await seedShop(id, owner, tech);
        const firestore = testEnv.authenticatedContext(tech).firestore();
        await assertSucceeds(
            setDoc(doc(firestore, 'shops', id, 'vehicleRecords', VIN), {
                shopId: id,
                vin: VIN,
                summary: '',
                claims: [],
            }),
        );
        await assertFails(deleteDoc(doc(firestore, 'shops', id, 'vehicleRecords', VIN)));
        await assertFails(
            deleteDoc(doc(testEnv.authenticatedContext(owner).firestore(), 'shops', id, 'vehicleRecords', VIN)),
        );
    });

    it('scopes tech profiles to their shop', async () => {
        const id = shopId();
        const other = shopId();
        const owner = `owner-${randomUUID()}`;
        const tech = `tech-${randomUUID()}`;
        await seedShop(id, owner, tech);
        await seedShop(other, `owner-${randomUUID()}`, `tech-${randomUUID()}`);
        const profile = { shopId: id, techId: tech, skillLevel: 'journeyman', units: 'metric' };
        await assertSucceeds(
            setDoc(doc(testEnv.authenticatedContext(tech).firestore(), 'shops', id, 'techProfiles', tech), profile),
        );
        // A tech writes only their own profile, never another tech's.
        await assertFails(
            setDoc(doc(testEnv.authenticatedContext(tech).firestore(), 'shops', id, 'techProfiles', 'other-tech'), {
                shopId: id,
                techId: 'other-tech',
                skillLevel: 'master',
                units: 'metric',
            }),
        );
        await assertFails(
            getDoc(doc(testEnv.authenticatedContext(owner).firestore(), 'shops', other, 'techProfiles', tech)),
        );
    });
});
