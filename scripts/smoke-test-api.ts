import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BYPASS_SECRET = process.env.DEV_BYPASS_SECRET;
const API_BASE = 'http://localhost:3000/api';

async function runSmokeTest() {
    console.log('🚀 Starting API Smoke Test...');
    console.log(`Using Bypass Secret: ${BYPASS_SECRET ? '✅ Found' : '❌ NOT FOUND'}`);

    if (!BYPASS_SECRET) {
        console.error('Error: DEV_BYPASS_SECRET not found in .env.local');
        process.exit(1);
    }

    // 1. Test Unauthorized (No Headers)
    console.log('\n1️⃣ Testing Unauthorized Access...');
    try {
        const res = await fetch(`${API_BASE}/vehicles?userId=test-user`);
        console.log(`Status: ${res.status} (Expected: 401)`);
    } catch {
        console.log("❌ Server not running? Run 'npm run dev' first.");
        return;
    }

    // 2. Test Secure Bypass (Pro Tier)
    console.log('\n2️⃣ Testing Secure Bypass (Pro Tier)...');
    const resPro = await fetch(`${API_BASE}/analysis/trigger`, {
        method: 'POST',
        headers: {
            'x-dev-bypass': BYPASS_SECRET,
            'x-user-id': '00000000-0000-0000-0000-000000000001',
            'x-user-tier': 'pro',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sessionId: '00000000-0000-0000-0000-000000000002',
            publicUrl: 'gs://test',
        }),
    });
    // We expect 404 if it passes security but session doesn't exist,
    // but 401/403 would mean security failed.
    console.log(`Status: ${resPro.status} (Passes security if not 401/403)`);
    const dataPro = await resPro.json();
    console.log(`Response:`, dataPro.error || 'Security Passed!');

    // 3. Test Pro Gating (Free User hitting Pro route)
    console.log('\n3️⃣ Testing Pro Gating (Free User)...');
    const resFree = await fetch(`${API_BASE}/analysis/trigger`, {
        method: 'POST',
        headers: {
            'x-dev-bypass': BYPASS_SECRET,
            'x-user-id': 'dev-tester-1',
            'x-user-tier': 'free',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: 'any-id' }),
    });
    console.log(`Status: ${resFree.status} (Expected: 403)`);
    const dataFree = await resFree.json();
    console.log(`Error Code: ${dataFree.code} (Expected: PRO_REQUIRED)`);

    // 4. Test Rate Limiting
    console.log('\n4️⃣ Testing Rate Limiting (Rapid Fire)...');
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
        const res = await fetch(`${API_BASE}/vehicles?userId=rate-limit-test`, {
            headers: { 'x-dev-bypass': BYPASS_SECRET, 'x-user-tier': 'free' },
        });
        lastStatus = res.status;
        if (lastStatus === 429) break;
    }
    console.log(`Status after 10+ reqs: ${lastStatus} (Expected: 429 if Upstash is configured)`);

    // 5. Test Chat Streaming
    console.log('\n5️⃣ Testing Chat Endpoint (Streaming)...');
    const resChat = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
            'x-dev-bypass': BYPASS_SECRET,
            'x-user-id': '00000000-0000-0000-0000-000000000001', // Valid UUID
            'x-session-id': '00000000-0000-0000-0000-000000000002', // Valid UUID
            'x-user-tier': 'pro',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: 'What is a brake rotor?' }],
            vehicleContext: '2020 Toyota Camry',
        }),
    });

    console.log(`Status: ${resChat.status} (Expected: 200)`);
    if (resChat.status === 200) {
        console.log('Reading response...');
        const text = await resChat.text();
        console.log(`Response length: ${text.length}`);
        console.log(`Snippet: ${text.substring(0, 200).replace(/\n/g, ' ')}...`);
    }

    console.log('\n✅ Smoke Test Complete.');
}

runSmokeTest();
