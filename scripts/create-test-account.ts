import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
    let credential;
    
    // Try to load service account from env var (local dev)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            credential = admin.credential.cert(serviceAccount);
        } catch (e) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY', e);
        }
    }

    // Fallback to application default (cloud/production)
    if (!credential) {
        credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
        credential,
        projectId: 'lemonade-3c4e7',
    });
}

const db = admin.firestore();
const auth = admin.auth();

const TEST_USER = {
    email: 'e2e-test@lemonade.dev',
    password: 'TestPassword123!',
    displayName: 'Test Technician'
};

const TEST_VEHICLE = {
    vin: '1HGBH41JXMN109186',
    specs: {
        year: 2017,
        make: 'Honda',
        model: 'Civic',
        engine: '1.5L Turbo',
        trim: 'EX-T'
    }
};

async function createTestAccount() {
    console.log(`Creating test account for ${TEST_USER.email}...`);

    let userRecord;
    try {
        // 1. Create or Get Auth User
        try {
            userRecord = await auth.getUserByEmail(TEST_USER.email);
            console.log('User already exists in Auth, updating password...');
            await auth.updateUser(userRecord.uid, {
                password: TEST_USER.password,
                displayName: TEST_USER.displayName,
                emailVerified: true
            });
        } catch (error: unknown) {
            if ((error as { code?: string }).code === 'auth/user-not-found') {
                console.log('User not found, creating new user...');
                userRecord = await auth.createUser({
                    email: TEST_USER.email,
                    password: TEST_USER.password,
                    displayName: TEST_USER.displayName,
                    emailVerified: true
                });
            } else {
                throw error;
            }
        }

        const userId = userRecord.uid;
        console.log(`User ID: ${userId}`);

        // 2. Create User Document in Firestore
        // Schema: src/core/types/models.ts -> UserSchema
        const userDocRef = db.collection('users').doc(userId);
        const userData = {
            id: userId,
            email: TEST_USER.email,
            displayName: TEST_USER.displayName,
            tier: 'free',
            preferences: {
                autoOpenCamera: false
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await userDocRef.set(userData, { merge: true });
        console.log('User document created/updated in Firestore.');

        // 3. Create Vehicle Document
        // Schema: src/core/types/models.ts -> VehicleSchema
        // Check if vehicle exists for this user with this VIN
        const vehiclesSnapshot = await db.collection('vehicles')
            .where('userId', '==', userId)
            .where('vin', '==', TEST_VEHICLE.vin)
            .get();

        if (!vehiclesSnapshot.empty) {
            console.log('Vehicle already exists for this user.');
        } else {
            const vehicleId = uuidv4();
            const vehicleDocRef = db.collection('vehicles').doc(vehicleId);
            const vehicleData = {
                id: vehicleId,
                vin: TEST_VEHICLE.vin,
                userId: userId,
                specs: TEST_VEHICLE.specs,
                activeIssuesCount: 0,
                createdAt: new Date(),
                photoUrl: null // Optional field
            };

            await vehicleDocRef.set(vehicleData);
            console.log(`Vehicle document created: ${vehicleId}`);
        }

        console.log('✅ Test account setup complete.');

    } catch (error) {
        console.error('❌ Error creating test account:', error);
        process.exit(1);
    }
}

createTestAccount();
