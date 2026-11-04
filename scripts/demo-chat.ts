/**
 * Runs the real chat pipeline (System 0 regex gate -> System 1 LLM safety
 * check -> streamed mechanic reply) against in-memory storage, so it needs no
 * Firebase or Google Cloud project.
 *
 *   npm run demo            # offline, scripted model replies
 *   npm run demo -- --groq  # live replies from Groq (GROQ_API_KEY in .env.local)
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import type {
    DiagnosticSession,
    ILogger,
    ISessionRepository,
    IVehicleRepository,
    StreamingEvent,
    Vehicle,
} from '@lemonade/core';
import {
    CompletionChatAdapter,
    CompletionSafetyAdapter,
    FakeChatCompletionClient,
    ReactiveSafetyService,
    createGroqClient,
    type ChatCompletionClient,
} from '@lemonade/infrastructure';
import { ChatService } from '@/application/services/ChatService';
import { ComplaintIdentificationService } from '@/application/services/ComplaintIdentificationService';
import { SafetyMonitor } from '@/application/services/SafetyMonitor';
import { SummarizationService } from '@/application/services/SummarizationService';

loadEnv({ path: '.env.local', quiet: true });

const SESSION_ID = '6f1c1c2e-1d2b-4c3a-9a51-6b0f0d9a2b10';
const VEHICLE_ID = '0b6a7c1e-8f53-4a43-9a5c-2f6f5c0e7d21';
const USER_ID = 'demo-user';

const QUESTIONS = [
    'My 2015 Civic squeals when I brake, mostly in the morning. What should I check?',
    'I smell gas leaking under the hood, can I keep driving to work?',
];

const silentLogger: ILogger = { info() {}, warn() {}, error() {}, debug() {} };

class InMemorySessionRepository {
    private readonly sessions = new Map<string, DiagnosticSession>();

    seed(session: DiagnosticSession) {
        this.sessions.set(session.id, session);
    }
    async getHistory(id: string) {
        return this.sessions.get(id) ?? null;
    }
    async findById(id: string) {
        return this.sessions.get(id) ?? null;
    }
    async addMessage(id: string, role: 'user' | 'assistant' | 'system', content: unknown) {
        this.sessions.get(id)?.messages.push({
            role,
            content: content as DiagnosticSession['messages'][number]['content'],
            timestamp: new Date(),
        });
    }
    async updateComplaint(id: string, complaint: string) {
        const session = this.sessions.get(id);
        if (session) session.complaint = complaint;
    }
}

const vehicle: Vehicle = {
    id: VEHICLE_ID,
    vin: '2HGFB2F50FH000000',
    userId: USER_ID,
    specs: { year: 2015, make: 'Honda', model: 'Civic', engine: '1.8L I4' },
    activeIssuesCount: 0,
    createdAt: new Date(),
};

const vehicleRepo = {
    findById: async (id: string) => (id === VEHICLE_ID ? vehicle : null),
} as unknown as IVehicleRepository;

function offlineClient(): ChatCompletionClient {
    // Replies in call order: safety check, mechanic answer, complaint label.
    return new FakeChatCompletionClient([
        JSON.stringify({
            safety_score: 95,
            hazards_detected: [],
            user_intent: 'diagnostic_question',
            intervention_required: false,
        }),
        'Morning-only squeal that fades after a few stops is usually surface rust on the rotors or glazed pads. ' +
            'Check pad thickness through the wheel spokes (replace under 3 mm) and look for a lip on the rotor edge.',
        'Brake squeal when cold',
    ]);
}

async function main() {
    const useGroq = process.argv.includes('--groq');
    const client = useGroq ? createGroqClient() : offlineClient();

    const sessions = new InMemorySessionRepository();
    sessions.seed({
        id: SESSION_ID,
        vehicleId: VEHICLE_ID,
        userId: USER_ID,
        status: 'active',
        obdCodes: [],
        aiAnalysis: null,
        messages: [],
        safety_stop: false,
        cumulativeVideoDurationProcessedMinutes: 0,
        cumulativeAudioDurationProcessedMinutes: 0,
        updatedAt: new Date(),
        startedAt: new Date(),
    });
    const sessionRepo = sessions as unknown as ISessionRepository;

    const chatAI = new CompletionChatAdapter(client);
    const chat = new ChatService(
        chatAI,
        sessionRepo,
        vehicleRepo,
        new ComplaintIdentificationService(sessionRepo, chatAI, silentLogger),
        silentLogger,
        new SummarizationService(chatAI, silentLogger),
        new ReactiveSafetyService(),
        new SafetyMonitor(new CompletionSafetyAdapter(client), silentLogger),
    );

    console.log(`Lemonade chat demo (${useGroq ? `Groq ${client.model}` : 'offline model'})\n`);
    for (const question of QUESTIONS) {
        console.log(`> ${question}`);
        let reply = '';
        for await (const event of chat.handleChatInteractionStream(
            SESSION_ID,
            question,
        ) as AsyncIterable<StreamingEvent>) {
            if (event.type === 'text') reply += event.content;
        }
        console.log(`${reply.trim()}\n`);
    }

    const stored = (await sessions.getHistory(SESSION_ID))?.messages.length ?? 0;
    console.log(`Session now holds ${stored} messages.`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
