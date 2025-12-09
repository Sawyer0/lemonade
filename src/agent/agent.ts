import 'reflect-metadata'; // MUST be first for Inversify
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';

// Load Environment Variables BEFORE importing other modules
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { type JobContext, ServerOptions, cli, defineAgent, voice, llm, initializeLogger } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { SYSTEM_PROMPTS } from '../core/prompts/system';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { ILogger } from '@/core/interfaces/ILogger';

// Explicitly initialize logging
initializeLogger({
    pretty: true,
    level: 'info',
});

export default defineAgent({
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        
        // Dynamic Imports for DI (Prevents hoisting issues)
        const { container } = await import('../infrastructure/di/container');
        const { TYPES } = await import('../infrastructure/di/types');
        const { CONFIG } = await import('../infrastructure/config');
        
        const logger = container.get<ILogger>(TYPES.Logger);

        logger.info('Agent connected to room', { room: ctx.room.name });

        // Helper: Ask the "Big Brain" (Pro Model)
        async function askSeniorMechanic(question: string, contextCacheName: string) {
            if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY missing");
            
            logger.info(`[Tool] Consulting Senior Mechanic (Pro Model)`, { cache: contextCacheName });
            
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
            
            // Use the TOOL model from CONFIG (The Brain)
            const proModel = genAI.getGenerativeModel({
                model: CONFIG.AI_MODELS.AGENT.BRAIN, 
                cachedContent: { name: contextCacheName } as any
            });

            const result = await proModel.generateContent(question);
            const text = result.response.text();
            logger.info(`[Tool] Senior Mechanic Answer`, { answerSnippet: text.substring(0, 50) });
            return text;
        }

        // 1. Fetch Session Context using Repository Pattern (DI)
        const sessionId = ctx.room.name; 
        let activeCacheName: string | undefined;

        try {
            // Resolve the Repository from the Container
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sessionRepo = container.get<any>(TYPES.SessionRepo);
            const session = await sessionRepo.findById(sessionId);

            if (session) {
                activeCacheName = session.context?.activeCacheName;
                logger.info(`[Session] Found active cache`, { activeCacheName });
            } else {
                logger.info(`[Session] No session found for ID`, { sessionId });
            }
        } catch (error) {
            logger.error("[Session] Error fetching session context", error);
        }

        const RealtimeModel = google.beta.realtime.RealtimeModel;

        if (!RealtimeModel) {
            logger.error("Could not find RealtimeModel");
            throw new Error("Could not find RealtimeModel in @livekit/agents-plugin-google");
        }

        const instructions = `
            ${SYSTEM_PROMPTS.IDENTITY}
            ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}
            ${SYSTEM_PROMPTS.DIAGNOSTIC_PROTOCOL}
            
            CONTEXT: You are in a live video/voice session with the user.
            You have access to a "Senior Mechanic" (Tool: consult_manual) who has read the user's manual.
            
            IF the user asks about specific specs (torque, fluids, wiring), DO NOT GUESS.
            Say "Let me check the manual..." and use the 'consult_manual' tool.
        `;

        // 2. Define the Tool using llm.tool
        const consultManualTool = llm.tool({
            description: "Ask the senior mechanic about specific specs, diagrams, or manual details found in the uploaded documents. Use this when the user asks for specific data like torque specs, wiring diagrams, or fluid capacities.",
            parameters: z.object({
                question: z.string().describe("The specific technical question to ask the manual (e.g. 'What is the torque spec for the head bolts?')")
            }),
            execute: async ({ question }) => {
                if (!activeCacheName) {
                    return "Error: No manual is currently loaded or cached for this session.";
                }
                try {
                    return await askSeniorMechanic(question, activeCacheName);
                } catch (error) {
                    logger.error("Manual lookup failed", error);
                    return "I had trouble reading the manual. Please ask the user to upload it again.";
                }
            }
        });

        // 3. Configure the "Eyes & Ears" (Flash Live)
        const model = new RealtimeModel({
            model: CONFIG.AI_MODELS.AGENT.EYES, // Use the LIVE model from CONFIG
            instructions: instructions,
            voice: 'Aoede', // Use the 'Aoede' voice as requested
        });

        // Create the Agent (holds instructions, model, and tools)
        const agent = new voice.Agent({
            instructions: instructions,
            llm: model,
            allowInterruptions: true, // Enable "Barge-In" interruption handling
            // Register the tool context here
            tools: {
                consult_manual: consultManualTool
            }
        });

        // Create the Session (Runtime)
        const session = new voice.AgentSession({
            llm: model,
        });

        // Start the session with the agent instance
        await session.start({ room: ctx.room, agent });

        logger.info('Agent started via voice.AgentSession with Agent instance and Tools!');
    },
});

// Check if this file is being run directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log("Starting Agent Server...");
    cli.runApp(new ServerOptions({
        agent: fileURLToPath(import.meta.url)
    }));
}