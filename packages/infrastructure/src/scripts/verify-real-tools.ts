
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import path from 'path';
import { GoogleSearchService } from '../external/GoogleSearchService';
import { NHTSAService } from '../external/NHTSAService';
import { ILogger, IBillingService } from '@lemonade/core';
import { EnvConfigProvider } from '../config/EnvConfigProvider';

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

// Simple Logger
const logger: ILogger = {
    info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
    warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
    error: (msg, err, meta) => console.error(`[ERROR] ${msg}`, err, meta ? JSON.stringify(meta) : ''),
    debug: (msg, meta) => console.log(`[DEBUG] ${msg}`, meta ? JSON.stringify(meta) : ''),
};

// Mock Billing (don't write to DB)
const mockBilling: IBillingService = {
    recordUsage: async () => { console.log('[MockBilling] Usage recorded'); },
    checkLimits: async () => ({ allowed: true, remaining: 1000 }),
    getUsage: async () => ({ totalTokens: 0, cost: 0, requests: 0 }),
} as unknown as IBillingService;

async function main() {
    console.log('🔄 Starting Live Tool Verification...');

    // 1. Config
    const config = new EnvConfigProvider();
    console.log('✅ Config Loaded');
    console.log('   GOOGLE_SEARCH_CX:', config.get('GOOGLE_SEARCH_CX') ? 'FOUND' : 'MISSING');
    console.log('   GOOGLE_SEARCH_API_KEY:', config.get('GOOGLE_SEARCH_API_KEY') ? '***FOUND***' : 'MISSING');

    // 2. Google Search
    console.log('\n🔎 Testing Google Search Service...');
    try {
        const googleService = new GoogleSearchService(logger, mockBilling, config);
        const searchResults = await googleService.search({
            query: '2020 Ford F-150 brake squeak TSB',
            limit: 3,
            userId: 'test-user',
            sessionId: 'test-session'
        });

        console.log(`   Result Count: ${searchResults.totalFound}`);
        if (searchResults.results.length > 0) {
            console.log(`   Top Result: ${searchResults.results[0].title}`);
            console.log(`   Link: ${searchResults.results[0].link}`);
            console.log('✅ Google Search Verification: PASSED');
        } else {
            console.error('❌ Google Search Verification: FAILED (No results)');
        }
    } catch (e) {
        console.error('❌ Google Search Verification: ERROR', e);
    }

    // 3. NHTSA
    console.log('\n🚗 Testing NHTSA Service...');
    try {
        const nhtsaService = new NHTSAService(logger);
        const recalls = await nhtsaService.checkRecalls(2018, 'Ford', 'F-150');

        console.log(`   Recalls Found: ${recalls.length}`);
        if (recalls.length > 0) {
            console.log(`   Sample Recall: ${recalls[0].Component} - ${recalls[0].Summary.substring(0, 100)}...`);
            console.log('✅ NHTSA Verification: PASSED');
        } else {
            console.warn('⚠️ NHTSA Verification: 0 Recalls found (might be valid, but check data)');
        }
    } catch (e) {
        console.error('❌ NHTSA Verification: ERROR', e);
    }
}

main().catch(console.error);
