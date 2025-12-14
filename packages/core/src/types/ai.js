"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_GENERATION_CONFIGS = void 0;
// Default configs as per the user's table
exports.AI_GENERATION_CONFIGS = {
    LIVE_VIDEO: {
        thinkingConfig: {
            thinkingBudget: 16384, // Max reasoning for video analysis
            includeThoughts: false
        },
        temperature: 0.1,
        responseMimeType: "application/json",
    },
    MANUAL_READER: {
        thinkingConfig: {
            thinkingBudget: 8192, // High reasoning for reading manuals
            includeThoughts: false
        },
        temperature: 0.0,
        responseMimeType: "text/plain",
    },
    MANUAL_MODERATE: {
        thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: false
        },
        temperature: 0.1,
        responseMimeType: "text/plain",
    },
    CHAT_BOT: {
        // No thinkingConfig -> Dynamic (Zero latency for simple, deep for complex)
        temperature: 0.4,
        responseMimeType: "text/plain",
    },
    CHAT_MODERATE: {
        thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: false
        },
        temperature: 0.3,
        responseMimeType: "text/plain",
    },
    CHAT_HIGH: {
        thinkingConfig: {
            thinkingBudget: 16384, // Force deep reasoning for Master Tech diagnosis
            includeThoughts: false
        },
        temperature: 0.2, // Low temp + high budget = focused deep thought
        responseMimeType: "text/plain",
    },
    VOICE_COMMAND: {
        temperature: 0.1,
        responseMimeType: "text/plain",
    }
};
