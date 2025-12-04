import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { VertexAI } from '@google-cloud/vertexai';
import { SYSTEM_PROMPTS } from './constants';
import { AppError, ErrorCode } from './errors';
import { CONFIG } from './config';

const db = getFirestore();

const authOptions = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? { credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) }
    : undefined;

const vertex = new VertexAI({
    project: CONFIG.GCLOUD_PROJECT,
    location: CONFIG.LOCATION,
    googleAuthOptions: authOptions
});

const model = vertex.getGenerativeModel({
    model: CONFIG.GEMINI_THINKING_MODEL,
    generationConfig: { responseMimeType: 'application/json' },
});

export const analyzeUploadedVideo = onObjectFinalized(
    {
        cpu: 2,
        memory: '2GiB',
        timeoutSeconds: 300,
        region: CONFIG.LOCATION,
    },
    async (event) => {
        const filePath = event.data.name;
        const contentType = event.data.contentType;

        const pathParts = filePath.split('/');
        const sessionId = pathParts.length >= 2 && pathParts[0] === 'sessions' ? pathParts[1] : null;

        if (!sessionId) {
            console.error(`Invalid file path format: ${filePath}`);
            return;
        }

        const sessionRef = db.collection('sessions').doc(sessionId);

        try {
            console.log(`Processing video for session: ${sessionId}`);

            if (!contentType?.startsWith('video/')) {
                throw new AppError(ErrorCode.INVALID_CONTENT_TYPE, `Invalid content type: ${contentType}`, 400);
            }

            await sessionRef.update({ status: 'analyzing' });

            const gcsUri = `gs://${event.data.bucket}/${filePath}`;

            const sessionDoc = await sessionRef.get();
            const sessionData = sessionDoc.data();
            const vehicleId = sessionData?.vehicleId;

            let vehicleContext = 'Unknown Vehicle';
            if (vehicleId) {
                const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
                const vehicleData = vehicleDoc.data();
                if (vehicleData?.specs) {
                    const { year, make, model: carModel, engine } = vehicleData.specs;
                    vehicleContext = `${year} ${make} ${carModel} ${engine}`;
                }
            }

            const prompt = SYSTEM_PROMPTS.VIDEO_ANALYSIS(vehicleContext);

            let result;
            try {
                result = await model.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { fileData: { fileUri: gcsUri, mimeType: contentType as string } },
                        ],
                    }],
                });
            } catch (err) {
                throw new AppError(ErrorCode.AI_SERVICE_ERROR, `Vertex AI call failed: ${err instanceof Error ? err.message : 'Unknown'}`, 502);
            }

            const rawText = result.response.candidates?.[0].content.parts[0].text;
            if (!rawText) {
                throw new AppError(ErrorCode.AI_EMPTY_RESPONSE, 'AI returned empty response', 502);
            }

            let analysis;
            try {
                analysis = JSON.parse(rawText);
            } catch {
                throw new AppError(ErrorCode.AI_PARSE_ERROR, 'Failed to parse AI response as JSON', 500);
            }

            await sessionRef.update({
                status: 'completed',
                ai_analysis: analysis,
                videoUrl: gcsUri,
                updatedAt: new Date(),
            });

            console.log(`Analysis complete for session: ${sessionId}`);

            if (analysis.safety_alert) {
                console.warn(`SAFETY ALERT triggered for session: ${sessionId}`);
                await sessionRef.update({
                    safety_stop: true,
                    safety_reason: analysis.diagnosis,
                });
            }

        } catch (error) {
            console.error(`Error analyzing video for session ${sessionId}:`, error);
            const appError = AppError.fromError(error);
            await sessionRef.update({
                status: 'error',
                error_code: appError.code,
                error_message: appError.message,
            });
        }
    }
);
