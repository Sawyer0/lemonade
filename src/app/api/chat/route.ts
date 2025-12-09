import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IBillingService } from '@/core/interfaces/IBillingService';
import { IAuthService } from '@/core/interfaces/IAuthService';
import { CONFIG } from '@/infrastructure/config';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';
import { SAFETY_INSTRUCTION_MASTER_TECH } from '@/core/prompts/safety';
import { generateId } from 'ai'; // Helper for Trace ID

// Initialize Google AI Provider
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
});

export async function POST(req: Request) {
  // 1. Generate Trace ID (Distributed Tracing Start)
  const traceId = req.headers.get('x-trace-id') || generateId();
  console.log(`[Trace: ${traceId}] Chat Request Started`);

  try {
    const { messages, vehicleContext, diagnosticContext } = await req.json();

    // 2. Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }
    const token = authHeader.split(' ')[1];
    const authService = container.get<IAuthService>(TYPES.AuthService);
    const decodedToken = await authService.verifyToken(token);
    const userId = decodedToken.uid;
    // We assume sessionId is passed in headers or body, typically for chat it's implicit in the thread
    // For MVP, we'll use a placeholder or extract if available. 
    // Let's assume the frontend passes 'x-session-id'.
    const sessionId = req.headers.get('x-session-id') || 'unknown-session';

    // 3. Billing Service Injection
    const billingService = container.get<IBillingService>(TYPES.BillingService);

    // 4. Construct System Prompt (Neuro-Symbolic)
    const systemPrompt = `
    ${SYSTEM_PROMPTS.IDENTITY}
    ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

    CONTEXT:
    Vehicle: ${vehicleContext || 'Not specified'}
    Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
    
    ${SAFETY_INSTRUCTION_MASTER_TECH}
    `;

    // 5. Stream with Telemetry Hooks
    const result = await streamText({
      model: google(CONFIG.AI_MODELS.TEXT_INTERFACE), // gemini-2.5-flash
      system: systemPrompt,
      messages,
      async onFinish({ usage, finishReason }) {
        // --- THE BILLING PATCH ---
        if (usage) {
            console.log(`[Trace: ${traceId}] Recording Usage: ${usage.promptTokens} in, ${usage.completionTokens} out`);
            await billingService.recordUsage({
                userId,
                sessionId,
                inputTokens: usage.promptTokens,
                outputTokens: usage.completionTokens,
                model: CONFIG.AI_MODELS.TEXT_INTERFACE,
                timestamp: new Date()
            }).catch(err => {
                console.error(`[Trace: ${traceId}] Billing Failed`, err);
            });
        }
      },
    });

    // Return stream with Trace ID header
    return result.toDataStreamResponse({
        headers: {
            'x-trace-id': traceId
        }
    });

  } catch (error) {
    console.error(`[Trace: ${traceId}] Chat Failed`, error);
    return new Response('Internal Server Error', { status: 500 });
  }
}