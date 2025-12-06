import { type JobContext, ServerOptions, cli, defineAgent, voice, initializeLogger } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Explicitly initialize logging to prevent "logger not initialized" errors in AgentSession
initializeLogger({
    pretty: true,
    level: 'info',
});

export default defineAgent({
    entry: async (ctx: JobContext) => {
        await ctx.connect();
        console.log('Agent connected to room:', ctx.room.name);

        const RealtimeModel = google.beta.realtime.RealtimeModel;

        if (!RealtimeModel) {
            console.error("Could not find RealtimeModel");
            throw new Error("Could not find RealtimeModel in @livekit/agents-plugin-google");
        }

        const model = new RealtimeModel({
            model: 'gemini-2.0-flash-exp',
            instructions: 'You are an expert mechanic. Help the user diagnose issues properly. Be concise.',
        });

        // Create the Agent (holds instructions and model reference)
        const agent = new voice.Agent({
            instructions: "You are an expert mechanic. Watch the video stream and help the user diagnose issues.",
            llm: model, // RealtimeModel attached to Agent
        });

        // Create the Session (Runtime)
        const session = new voice.AgentSession({
            llm: model,
        });

        // Start the session with the agent instance
        await session.start({ room: ctx.room, agent });

        console.log('Agent started via voice.AgentSession with Agent instance!');
    },
});

// Check if this file is being run directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log("Starting Agent Server...");
    cli.runApp(new ServerOptions({
        agent: fileURLToPath(import.meta.url)
    }));
}
