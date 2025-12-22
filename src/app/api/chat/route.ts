import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import {
  IBillingService,
  ISessionService,
  SYSTEM_PROMPTS,
  SAFETY_INSTRUCTION_MASTER_TECH,
  ILogger
} from '@lemonade/core';
import { CONFIG } from '@/infrastructure/config';
import { adminAuth } from '@lemonade/infrastructure';
import { withContext } from '@/application/utils/apiHandler';
import { RequestContext } from '@lemonade/infrastructure';

// Initialize Google AI Provider
const google = createGoogleGenerativeAI({
  apiKey: CONFIG.AI_MODELS.GOOGLE_API_KEY,
});

export const maxDuration = 60; // Timeout handling

export const POST = withContext(async function POST(req: Request): Promise<NextResponse> {
  // 1. Generate/Get Trace ID (Distributed Tracing Start)
  const logger = container.get<ILogger>(TYPES.Logger);
  logger.info(`Chat Request Started`, { path: req.url });
  const traceId = RequestContext.getTraceId(); // Capture for async callback

  try {
    const { messages, vehicleContext, diagnosticContext } = await req.json();

    // 2. Authentication (Server-Side)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn(`Unauthorized: Missing Token`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    // Verify using Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const sessionId = req.headers.get('x-session-id') || 'unknown-session';

    // 3. Billing Service Injection
    const billingService = container.get<IBillingService>(TYPES.BillingService);

    // 3b. Context Security (AuthZ) & Sanitize
    const sessionService = container.get<ISessionService>(TYPES.SessionService);
    let authoritativeContext = vehicleContext || 'Not specified';

    if (sessionId && sessionId !== 'unknown-session') {
      try {
        const { vehicle } = await sessionService.getSessionContext(sessionId);
        // Construct trusted context string
        authoritativeContext = JSON.stringify(vehicle.specs);
        logger.info("Using authoritative vehicle context from DB", { sessionId });
      } catch (error) {
        logger.warn("Failed to load session context, falling back to client provided context", { error });
        // Sanitize fallback
        authoritativeContext = `<unverified_context>${String(vehicleContext).replace(/<[^>]*>?/gm, '')}</unverified_context>`;
      }
    } else {
      // No session, sanitize client input
      authoritativeContext = `<unverified_context>${String(vehicleContext).replace(/<[^>]*>?/gm, '')}</unverified_context>`;
    }

    // 4. Construct System Prompt (Neuro-Symbolic)
    const systemPrompt = `
    ${SYSTEM_PROMPTS.IDENTITY}
    ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

    CONTEXT:
    Vehicle: ${authoritativeContext}
    Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
    
    ${SAFETY_INSTRUCTION_MASTER_TECH}
    `;

    // 5. Stream with Telemetry Hooks
    const result = await streamText({
      model: google(CONFIG.AI_MODELS.CHAT_MODEL),
      system: systemPrompt,
      messages,
      async onFinish({ usage }) {
        // --- THE BILLING PATCH ---
        if (usage) {
          // Safe cast to avoid TS errors
          // Note: AI SDK v4+ uses inputTokens/outputTokens, v3 used promptTokens/completionTokens
          const typedUsage = usage as unknown as Record<string, number | undefined>;

          const inputTokens = typedUsage.promptTokens ?? typedUsage.inputTokens ?? 0;
          const outputTokens = typedUsage.completionTokens ?? typedUsage.outputTokens ?? 0;


          // Re-establish request context for async callback to ensure tracing works
          await RequestContext.run({ traceId }, async () => {
            logger.info(`Recording Usage: ${inputTokens} in, ${outputTokens} out`, { usage });
            await billingService.recordUsage({
              userId,
              sessionId,
              inputTokens,
              outputTokens,
              model: CONFIG.AI_MODELS.CHAT_MODEL,
              timestamp: new Date(),
            }, traceId).catch(err => {
              logger.error(`Billing Failed`, err, { sessionId });
            });
          });
        }
      },
    });

    // Return stream with Trace ID header
    const response = result.toTextStreamResponse({
      headers: {
        'x-trace-id': traceId
      }
    });
    return new NextResponse(response.body, response);

  } catch (error) {
    logger.error(`Chat Failed`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});

