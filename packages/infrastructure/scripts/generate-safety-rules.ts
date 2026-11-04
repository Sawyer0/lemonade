/**
 * generate-safety-rules.ts
 *
 * Generates automotive safety rules using Gemini's knowledge base.
 * Run with: npx tsx packages/infrastructure/scripts/generate-safety-rules.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local at project root
config({ path: resolve(__dirname, '../../../.env.local') });

import { GoogleGenerativeAI, type Schema, SchemaType } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Define the output schema for structured Gemini output
const GENERATED_RULES_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        environmentalTriggers: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    id: { type: SchemaType.STRING },
                    pattern: { type: SchemaType.STRING, description: 'Regex pattern as string (without slashes)' },
                    hazard: { type: SchemaType.STRING },
                    message: { type: SchemaType.STRING },
                },
                required: ['id', 'pattern', 'hazard', 'message'],
            },
        },
        interactionHazards: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    id: { type: SchemaType.STRING },
                    nounPattern: { type: SchemaType.STRING, description: 'Regex pattern for dangerous nouns' },
                    hazard: { type: SchemaType.STRING },
                    message: { type: SchemaType.STRING },
                },
                required: ['id', 'nounPattern', 'hazard', 'message'],
            },
        },
        safeVerbs: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
        },
    },
    required: ['environmentalTriggers', 'interactionHazards', 'safeVerbs'],
};

const HAZARD_TYPES = [
    'JACK_STAND_MISSING',
    'HIGH_VOLTAGE',
    'FUEL_LEAK',
    'SAFETY_CHECK_FAILED',
    'NONE',
    'CARBON_MONOXIDE',
    'AIRBAG_DEPLOYMENT',
    'BRAKE_FAILURE',
    'COOLANT_LEAK',
    'EXHAUST_FUMES',
    'ROTATING_PARTS',
    'HOT_SURFACES',
    'CHEMICAL_EXPOSURE',
    'SUSPENDED_LOAD',
    'PRESSURIZED_SYSTEM',
    'BATTERY_ACID',
    'REFRIGERANT_LEAK',
    'ELECTRICAL_SHORT',
    'UNSTABLE_VEHICLE',
    'FIRE_RISK',
];

const GENERATION_PROMPT = `
You are an automotive safety expert generating safety rules for a vehicle diagnostic AI.

## 1. ENVIRONMENTAL TRIGGERS (20 rules)
These ALWAYS fire when the pattern matches - no safe verbs can override them.
Create patterns that match NATURAL LANGUAGE users might type.

REQUIRED COVERAGE - at least one rule for each:
- CARBON_MONOXIDE: Match phrases like "car running in garage", "engine running indoors", "exhaust fumes inside", "running in the garage"
- AIRBAG_DEPLOYMENT: Match "airbag deployed", "airbag went off", "airbag powder"
- BRAKE_FAILURE: Match "no brakes", "brakes failed", "brake pedal to floor", "lost brakes", "pedal goes to the floor"
- COOLANT_LEAK: Match "antifreeze leaking", "coolant leak", "green fluid under car"
- BATTERY_ACID: Match "acid spilling", "battery acid", "corroded battery acid"
- UNSTABLE_VEHICLE: Match "car fell off jack", "vehicle fell", "slipped off jack", "fell off the jack"
- FUEL_LEAK: Match "gas leak", "fuel spill", "smells like gas", "leaking gas"
- FIRE_RISK: Match "smoke", "fire", "flames", "burning smell"
- ELECTRICAL_SHORT: Match "sparking", "electrical fire", "burnt wire smell"
- REFRIGERANT_LEAK: Match "AC leak", "refrigerant", "freon leak"

Pattern requirements:
- Use \\\\b for word boundaries
- Use alternations like (word1|word2) to match variations
- Make patterns BROAD to catch natural language
- Example: "\\\\b(car|engine|vehicle).*(running|on).*(in|inside).*(garage|enclosed)" for CO

## 2. INTERACTION HAZARDS (15 rules)  
These fire when dangerous NOUN is present WITHOUT a safe verb.

REQUIRED COVERAGE:
- HIGH_VOLTAGE: orange cable, HV battery, high voltage
- ROTATING_PARTS: fan blade, cooling fan, radiator fan, serpentine belt, pulley
- HOT_SURFACES: exhaust manifold, turbocharger, radiator cap
- PRESSURIZED_SYSTEM: AC line, ac lines, fuel rail, brake line
- AIRBAG_DEPLOYMENT: airbag module, SRS, yellow connector
- UNSTABLE_VEHICLE: jacked vehicle, vehicle on jack
- JACK_STAND_MISSING: under the car, under the vehicle

## 3. SAFE VERBS (40+ verbs)
Include ALL conjugations. MUST include each of these:
see, seeing, saw, look, looking, looked, inspect, inspecting, inspected, check, checking, checked, 
test, testing, tested, examine, examining, examined, observe, observing, observed, 
scan, scanning, scanned, notice, noticing, noticed, find, finding, found,
view, viewing, watch, watching, read, reading, verify, identify, assess, evaluate, review, document

CRITICAL REQUIREMENTS:
- Use hazard types from: ${HAZARD_TYPES.join(', ')}
- Patterns: regex strings with \\\\b word boundaries
- Make patterns BROAD to catch natural language variations
- IDs: "env-001", "int-001" format
`;

async function generateSafetyRules() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error(
            'Error: GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable required',
        );
        process.exit(1);
    }

    console.log('🚀 Generating safety rules using Gemini...');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: GENERATED_RULES_SCHEMA,
        },
    });

    try {
        const result = await model.generateContent(GENERATION_PROMPT);
        const response = result.response;
        const text = response.text();

        const generatedRules = JSON.parse(text);

        // Add metadata
        const output = {
            generatedAt: new Date().toISOString(),
            version: '1.0.0',
            generator: 'gemini-2.5-flash',
            ...generatedRules,
        };

        // Write to output file
        const outputPath = path.join(__dirname, '../src/services/generated-safety-rules.json');
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

        console.log(`✅ Generated ${output.environmentalTriggers.length} environmental triggers`);
        console.log(`✅ Generated ${output.interactionHazards.length} interaction hazards`);
        console.log(`✅ Generated ${output.safeVerbs.length} safe verbs`);
        console.log(`📁 Saved to: ${outputPath}`);
    } catch (error) {
        console.error('❌ Error generating rules:', error);
        process.exit(1);
    }
}

// Run if executed directly
generateSafetyRules();
