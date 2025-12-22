import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { CONFIG } from '@/infrastructure/config';
import { container } from '@/infrastructure/di/container';
import { withContext } from '@/application/utils/apiHandler';
import type { IServerAuthService, ISessionRepository, IVehicleRepository, INHTSAService, ILogger } from '@lemonade/core';
import {
    DiagnosticSession,
    AppError,
    ErrorCode,
    SYSTEM_PROMPTS,
    SAFETY_INSTRUCTION_MASTER_TECH
} from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

/**
 * Token Vending Machine for Gemini Client SDK
 * Returns a short-lived OAuth Access Token AND the Contextual System Instruction
 */
export const GET = withContext(async (req: NextRequest) => {
    try {
        // 1. Authenticate User
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split('Bearer ')[1];

        const authService = container.get<IServerAuthService>(TYPES.ServerAuthService);
        const decodedToken = await authService.verifyToken(idToken);
        const userId = decodedToken.uid;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Fetch Session Context (for Prompt Construction)
        // Client should pass sessionId query param
        const url = new URL(req.url);
        const sessionId = url.searchParams.get('sessionId');

        let systemInstruction = "";

        if (sessionId) {
            const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
            const session: DiagnosticSession | null = await sessionRepo.findById(sessionId);

            if (session && session.userId === userId) {
                const vehicleRepo = container.get<IVehicleRepository>(TYPES.VehicleRepo); // Resolve VehicleRepo
                const vehicle = await vehicleRepo.findById(session.vehicleId); // Fetch Vehicle

                if (!vehicle) {
                    throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Vehicle not found for session');
                }

                const nhtsaService = container.get<INHTSAService>(TYPES.NHTSAService); // Resolve NHTSAService
                const recalls = await nhtsaService.checkRecalls(
                    vehicle.specs.year,
                    vehicle.specs.make,
                    vehicle.specs.model
                );

                let recallSummary = "No active recalls found.";
                if (recalls.length > 0) {
                    recallSummary = recalls.map(r => `- Component: ${r.Component}, Summary: ${r.Summary}`).join('\n');
                }

                // Construct the Contextual Prompt (The "Brain")
                // We combine the static "Identity" with dynamic Session Data
                const vehicleStr = `${vehicle.specs.year} ${vehicle.specs.make} ${vehicle.specs.model} (${vehicle.specs.engine})`;

                systemInstruction = `
${SYSTEM_PROMPTS.IDENTITY}
${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

CONTEXT:
Vehicle: ${vehicleStr}
VIN: ${vehicle.vin}
Active Recalls:
${recallSummary}
History Summary: ${session.messages.slice(-3).map(m => (typeof m.content === 'string' ? m.content : 'multimodal content')).join(' | ')}

${SAFETY_INSTRUCTION_MASTER_TECH}
`;
            }
        } else {
            // Fallback generic prompt
            systemInstruction = `${SYSTEM_PROMPTS.IDENTITY}\n${SAFETY_INSTRUCTION_MASTER_TECH}`;
        }

        // 3. Generate Google OAuth Token
        // This uses the Server's Service Account Identity
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            projectId: CONFIG.GCLOUD.PROJECT_ID,
            // Uses GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_KEY if set in env
            credentials: CONFIG.FIREBASE.SERVICE_ACCOUNT
        });

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        if (!accessToken.token) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to generate access token');
        }

        // 4. Return Token + Brain
        return NextResponse.json({
            token: accessToken.token,
            expiresAt: accessToken.res?.data?.expiry_date,
            projectId: CONFIG.GCLOUD.PROJECT_ID,
            location: 'us-central1',
            systemInstruction // The Backend-generated Brain
        });


    } catch (error) {
        const logger = container.get<ILogger>(TYPES.Logger);
        logger.error('Token Generation Failed', error as Error);
        return NextResponse.json(
            { error: 'Failed to generate token' },
            { status: 500 }
        );
    }
});
