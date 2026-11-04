const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local to avoid installing dotenv
function loadEnv() {
    try {
        const envPath = path.resolve(__dirname, '../.env.local');
        if (!fs.existsSync(envPath)) return {};
        const content = fs.readFileSync(envPath, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                let value = match[2] || '';
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
                env[match[1]] = value;
            }
        });
        return env;
    } catch (e) {
        console.warn('Error loading .env.local:', e);
        return {};
    }
}

const env = loadEnv();

async function updateCors() {
    try {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const bucketName = process.env.GCLOUD_MEDIA_BUCKET || env.GCLOUD_MEDIA_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

        if (!serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not found');

        // Initialize Storage
        const credentials = JSON.parse(serviceAccount);
        console.log(`\n🔑 Using Service Account: ${credentials.client_email}`);
        console.log(`   (Make sure THIS email has 'Storage Admin' role in IAM)\n`);

        const storage = new Storage({
            projectId: credentials.project_id,
            credentials
        });

        // Try to list buckets (Requires Storage Admin or Viewer)
        try {
            console.log("Listing buckets (verifying permissions)...");
            const [buckets] = await storage.getBuckets();
            if (buckets.length === 0) {
                console.log("⚠️  No buckets found. (Permissions might still be missing or project is empty)");
            } else {
                console.log("✅ Found buckets:");
                buckets.forEach(b => console.log(`   - ${b.name}`));
            }
        } catch (e) {
            console.log("⚠️  Could not list buckets (Likely missing 'Storage Admin' permission)", e);
        }

        // List of buckets to try
        const targets = [
            bucketName, // from env
            `${credentials.project_id}.appspot.com`, // classic firebase
            `staging.${credentials.project_id}.appspot.com` // staging
        ].filter(Boolean);

        // Remove duplicates
        const uniqueTargets = [...new Set(targets)];

        for (const target of uniqueTargets) {
            try {
                console.log(`\nAttempting to set CORS for: ${target}...`);
                const bucket = storage.bucket(target);
                await bucket.setCorsConfiguration([
                    {
                        maxAgeSeconds: 3600,
                        method: ['GET', 'PUT', 'POST', 'OPTIONS'],
                        origin: ['*'],
                        responseHeader: ['Content-Type', 'x-goog-resumable']
                    }
                ]);
                console.log(`✅ SUCCESS! CORS updated for ${target}`);
                return; // Exit after first success
            } catch (e) {
                if (e.code === 404) {
                    console.log(`❌ Bucket ${target} not found.`);
                } else {
                    console.error(`❌ Error on ${target}:`, e.message);
                    if (e.code === 403) console.log("   (Access Denied - Check IAM Permissions!)");
                }
            }
        }

        console.log("\n❌ Could not update CORS on any candidate bucket.");

    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

updateCors();
