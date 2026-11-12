import { describe, it, expect, vi } from 'vitest';
import { createActor, type AnyActorLogic } from 'xstate';
import type {
    AIAnalysis,
    CaseEvidence,
    IChatAssistantAI,
    IEmbeddingService,
    IGoogleSearchService,
    ILogger,
    IMemoryService,
    IMultimodalUploadAnalyzer,
    INHTSAService,
    ISessionRepository,
    IVectorRepository,
    NeurosymbolicState,
    ReasoningInput,
    SafetyRecall,
    VerificationData,
} from '@lemonade/core';
import { parseModelJson } from '../modelJson';
import { EvidenceAnalyzer, buildEnhancedContext } from '../EvidenceAnalyzer';
import { DiagnosisMemoryWriter } from '../DiagnosisMemoryWriter';
import { findMatchingRecall, synthesizeDiagnosis } from '../DiagnosisSynthesizer';
import { createMechanicActors } from '../mechanicActors';
import type { IntuitionGenerator } from '../IntuitionGenerator';

function logger(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

function analysis(overrides: Partial<AIAnalysis> = {}): AIAnalysis {
    return {
        diagnosis: 'Worn front brake pads',
        reasoning: 'Grinding under braking',
        investigationPlan: ['Measure pad thickness'],
        visual_evidence: [],
        acoustic_evidence: [],
        severity: 'medium',
        safety_alert: false,
        suggested_actions: ['Replace pads'],
        engineDescription: '',
        isStock: true,
        visualConflictDetected: false,
        detectedCondition: 'unknown',
        confidence: 0.8,
        ...overrides,
    };
}

function recall(overrides: Partial<SafetyRecall> = {}): SafetyRecall {
    return {
        ReportReceivedDate: '2024-01-01',
        Component: 'SERVICE BRAKES',
        Summary: 'Brake caliper bolts may loosen.',
        Consequence: 'Reduced braking.',
        Remedy: 'Dealers will torque the bolts.',
        Notes: '',
        ...overrides,
    };
}

const unverified: VerificationData = {
    isVerified: false,
    verifiedSource: null,
    conflictingEvidence: null,
    searchQueryUsed: null,
};

const input: ReasoningInput = {
    userQuery: 'grinding noise when braking',
    vehicleContext: { year: 2015, make: 'Honda', model: 'Civic', vin: '19XFB2F59FE000000' },
    sessionId: 's-1',
    userId: 'u-1',
};

describe('parseModelJson', () => {
    it('parses plain and fenced JSON and rejects prose', () => {
        expect(parseModelJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
        expect(parseModelJson<{ a: number }>('```json\n{"a":2}\n```')).toEqual({ a: 2 });
        expect(() => parseModelJson('not json')).toThrow();
    });
});

describe('buildEnhancedContext', () => {
    it('adds history, recalls and search results only when present', () => {
        expect(buildEnhancedContext({ make: 'Honda' }, undefined, [], undefined)).toBe('{"make":"Honda"}');

        const context = buildEnhancedContext(
            { make: 'Honda' },
            [{ id: 'm1', content: 'Pads replaced in 2024' } as never],
            [recall()],
            { results: [{ title: 'Civic grinding', snippet: 'check pads', link: 'x' }], queryUsed: 'q', totalFound: 1 },
        );
        expect(context).toContain('VEHICLE HISTORY');
        expect(context).toContain('Pads replaced in 2024');
        expect(context).toContain('ACTIVE RECALLS');
        expect(context).toContain('SERVICE BRAKES');
        expect(context).toContain('WEB SEARCH RESULTS');
    });
});

describe('EvidenceAnalyzer', () => {
    function analyzer(chatReply: unknown = JSON.stringify(analysis())) {
        const videoAI = { analyzeUploadedVideo: vi.fn().mockResolvedValue(analysis({ diagnosis: 'from video' })) };
        const chatAI = {
            generateReply: vi.fn().mockImplementation(async () => {
                if (chatReply instanceof Error) throw chatReply;
                return chatReply;
            }),
        };
        const subject = new EvidenceAnalyzer(
            videoAI as unknown as IMultimodalUploadAnalyzer,
            chatAI as unknown as IChatAssistantAI,
            logger(),
        );
        return { subject, videoAI, chatAI };
    }

    it('trusts confident on-device triage without calling a model', async () => {
        const { subject, videoAI, chatAI } = analyzer();
        const result = await subject.analyze({
            ...input,
            localTriage: {
                detections: [],
                timestamp: 1,
                confidence: 0.9,
                primaryIssue: 'Cracked rotor',
                safetyConcern: true,
                componentsMentioned: ['rotor'],
            },
        });
        expect(result).toMatchObject({ diagnosis: 'Cracked rotor', severity: 'high', safety_alert: true });
        expect(videoAI.analyzeUploadedVideo).not.toHaveBeenCalled();
        expect(chatAI.generateReply).not.toHaveBeenCalled();
    });

    it('analyzes the uploaded video when there is one', async () => {
        const { subject, videoAI } = analyzer();
        const result = await subject.analyze({ ...input, videoUrl: 'gs://b/v.mp4', videoDurationMinutes: 2 });
        expect(result.diagnosis).toBe('from video');
        expect(videoAI.analyzeUploadedVideo).toHaveBeenCalledWith(
            'gs://b/v.mp4',
            expect.any(String),
            'video/mp4',
            'u-1',
            's-1',
            'high',
            2,
        );
    });

    it('folds queued mid-run evidence into the vision and text prompts', async () => {
        const { subject, videoAI, chatAI } = analyzer();
        const queued: CaseEvidence[] = [
            { id: 'e1', kind: 'reading', summary: 'OBD: P0300 misfire on cylinder 3', receivedAt: new Date() },
        ];
        await subject.analyze({ ...input, videoUrl: 'gs://b/v.mp4' }, undefined, undefined, undefined, [], queued);
        expect(videoAI.analyzeUploadedVideo.mock.calls[0][1]).toContain('NEW EVIDENCE ARRIVED DURING THIS RUN');
        expect(videoAI.analyzeUploadedVideo.mock.calls[0][1]).toContain('OBD: P0300 misfire on cylinder 3');

        await subject.analyze(input, undefined, undefined, undefined, [], queued);
        expect(chatAI.generateReply).toHaveBeenCalled();
        const textPrompt = (chatAI.generateReply as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1];
        expect(textPrompt).toContain('OBD: P0300 misfire on cylinder 3');
    });

    it('falls back to a text diagnosis, joining part replies', async () => {
        const { subject } = analyzer([{ type: 'text', text: '```json\n' + JSON.stringify(analysis()) + '\n```' }]);
        expect((await subject.analyze(input)).diagnosis).toBe('Worn front brake pads');
    });

    it('returns a safe low-confidence result when the text model fails', async () => {
        const { subject } = analyzer(new Error('model down'));
        const result = await subject.analyze(input, undefined, { ...unverified, isVerified: true } as never);
        expect(result).toMatchObject({ diagnosis: 'Verified via Research', confidence: 0.1 });
        const unparsable = analyzer('the pads look worn');
        expect((await unparsable.subject.analyze(input)).diagnosis).toBe('Unknown Issue');
    });
});

describe('DiagnosisSynthesizer', () => {
    it('matches recalls by component or by summary words', () => {
        expect(findMatchingRecall('failing service brakes', [recall()])?.Component).toBe('SERVICE BRAKES');
        expect(findMatchingRecall('loose caliper', [recall()])).toBeDefined();
        expect(findMatchingRecall('dead battery', [recall()])).toBeUndefined();
    });

    it('turns a recall match into the diagnosis and leads with the remedy', () => {
        const result = synthesizeDiagnosis(analysis({ diagnosis: 'loose caliper' }), [recall()], [], unverified);
        expect(result.decision).toBe('PROCEED');
        expect(result.userOutput).toContain('RECALL IDENTIFIED: SERVICE BRAKES');
        expect(result.requiredActions[0]).toBe('Dealers will torque the bolts.');
    });

    it('refers to a human when verification contradicts the hypothesis', () => {
        const result = synthesizeDiagnosis(analysis(), [], [], {
            ...unverified,
            conflictingEvidence: 'TSB says rotor',
        });
        expect(result).toMatchObject({ decision: 'REFER_TO_HUMAN', metaConfidence: 0 });
        expect(result.userOutput).toContain('TSB says rotor');
    });

    it('no longer punts on low confidence: weak unverified intuition proceeds best-effort', () => {
        // LM-37 deleted the hand-tuned meta-confidence blend that drove
        // the REQUEST_MORE_INFO punt. This layer claims no confidence
        // (metaConfidence 0) and the loop's calibrated stop rule owns
        // escalation, so weak intuition proceeds instead of punting.
        const weak = analysis({ confidence: 0.2 });
        expect(synthesizeDiagnosis(weak, [], [], unverified)).toMatchObject({
            decision: 'PROCEED',
            metaConfidence: 0,
        });
        expect(synthesizeDiagnosis({ ...weak, investigationPlan: [] }, [], [], unverified)).toMatchObject({
            decision: 'PROCEED',
            metaConfidence: 0,
        });
    });

    it('refers when strong consensus contradicts an unverified hypothesis', () => {
        const consensus = [{ text: 'Warped rotors' }, { text: 'Warped rotors' }, { text: 'Warped rotors' }];
        expect(synthesizeDiagnosis(analysis(), [], consensus, unverified)).toMatchObject({
            decision: 'REFER_TO_HUMAN',
            metaConfidence: 0,
        });
    });

    it('notes unrelated recalls, marks verification and stops on danger', () => {
        const triage = { detections: [{ id: { obj: 'pads' }, confidence: 0.95 }] };
        const verified = synthesizeDiagnosis(
            analysis({ diagnosis: 'Dead battery' }),
            [recall({ Component: 'AIR BAGS', Summary: 'Inflator' })],
            [],
            { ...unverified, isVerified: true },
            triage,
        );
        expect(verified.userOutput).toContain('(Verified by external data)');
        expect(verified.userOutput).toContain('1 active recall(s)');
        expect(verified.reasoningTrace).toContain('LOCAL GROUNDING');

        expect(synthesizeDiagnosis(analysis({ safety_alert: true }), [], [], unverified).decision).toBe('STOP_DANGER');
        expect(synthesizeDiagnosis(analysis({ severity: 'critical' }), [], [], unverified).decision).toBe(
            'STOP_DANGER',
        );
    });
});

describe('DiagnosisMemoryWriter', () => {
    function state(isVerified: boolean): NeurosymbolicState {
        return {
            intuition: { hypothesis: 'pads', confidence: 0.8, reasoning: '', investigationPlan: [] },
            authorityData: { vin: '19XFB2F59FE000000', nhtsaRecalls: [], manualSpecs: null, safetyAlerts: [] },
            visualGrounding: {
                engineDescription: '',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
            },
            consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
            verification: { ...unverified, isVerified },
            finalDiagnosis: {
                decision: 'PROCEED',
                reasoningTrace: 'trace',
                userOutput: 'Worn pads',
                requiredActions: ['Replace pads'],
                metaConfidence: 0.9,
            },
        };
    }

    function writer(session: unknown = null) {
        const deps = {
            embedding: { embed: vi.fn().mockResolvedValue([0.1]) },
            vectors: { addCase: vi.fn().mockResolvedValue(undefined) },
            memory: { addDocument: vi.fn().mockResolvedValue(undefined) },
            sessions: { findById: vi.fn().mockResolvedValue(session) },
            log: logger(),
        };
        const subject = new DiagnosisMemoryWriter(
            deps.embedding as unknown as IEmbeddingService,
            deps.vectors as unknown as IVectorRepository,
            deps.memory as unknown as IMemoryService,
            deps.sessions as unknown as ISessionRepository,
            deps.log,
        );
        return { subject, ...deps };
    }

    it('stores the case vector and a session-scoped diagnostic log', async () => {
        const { subject, vectors, memory, sessions } = writer();
        await subject.save('grinding', state(false), 'u-1', 's-1');
        expect(vectors.addCase).toHaveBeenCalledWith(
            'grinding',
            [0.1],
            expect.objectContaining({ userId: 'u-1', diagnosis: 'Worn pads', vehicle: '19XFB2F59FE000000' }),
        );
        const doc = memory.addDocument.mock.calls[0][0];
        expect(doc.content).toContain('Final Diagnosis: Worn pads');
        expect(doc.tags).toEqual(expect.arrayContaining(['user:u-1', 'vin:19XFB2F59FE000000', 'status:session']));
        expect(sessions.findById).not.toHaveBeenCalled();
    });

    it('ingests the video and unique images of a verified session', async () => {
        const image = { type: 'image', image: 'https://x/p.jpg' };
        const { subject, memory } = writer({
            videoUrl: 'gs://b/v.mp4',
            messages: [{ content: [image, image] }, { content: 'text only' }],
        });
        memory.addDocument
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('video too large'))
            .mockResolvedValueOnce(undefined);
        await subject.save('grinding', state(true), 'u-1', 's-1');
        const urls = memory.addDocument.mock.calls.map((c) => c[0].url).filter(Boolean);
        expect(urls).toEqual(['gs://b/v.mp4', 'https://x/p.jpg']);
    });

    it('keeps going when long-term memory is down', async () => {
        const { subject, memory, log } = writer();
        memory.addDocument.mockRejectedValueOnce(new Error('503'));
        await expect(subject.save('grinding', state(false), 'u-1', 's-1')).resolves.toBeUndefined();
        expect(log.error).toHaveBeenCalled();
    });
});

describe('createMechanicActors', () => {
    async function run<T>(logic: AnyActorLogic, actorInput: unknown): Promise<T> {
        const actor = createActor(logic, { input: actorInput });
        const done = new Promise<T>((resolve, reject) => {
            actor.subscribe({
                complete: () => resolve(actor.getSnapshot().output as T),
                error: reject,
            });
        });
        actor.start();
        return done;
    }

    function actors() {
        const deps = {
            intuition: { generate: vi.fn().mockResolvedValue(analysis()) },
            evidence: { analyze: vi.fn().mockResolvedValue(analysis({ diagnosis: 'seen on video' })) },
            nhtsaService: { checkRecalls: vi.fn().mockResolvedValue([recall()]) },
            searchService: { search: vi.fn().mockRejectedValue(new Error('quota')) },
            chatAI: { verifyHypothesis: vi.fn().mockResolvedValue({ isVerified: true }) },
            logger: logger(),
        };
        return {
            deps,
            logic: createMechanicActors({
                ...deps,
                intuition: deps.intuition as unknown as IntuitionGenerator,
                evidence: deps.evidence as never,
                nhtsaService: deps.nhtsaService as unknown as INHTSAService,
                searchService: deps.searchService as unknown as IGoogleSearchService,
                chatAI: deps.chatAI as unknown as IChatAssistantAI,
            }),
        };
    }

    it('delegates intuition, recalls and verification to their services', async () => {
        const { logic, deps } = actors();
        await run(logic.generateIntuition, { userQuery: 'q', vehicleContext: {}, sessionId: 's' });
        expect(deps.intuition.generate).toHaveBeenCalled();
        expect(await run(logic.nhtsaCheck, { data: { year: 2015, make: 'Honda', model: 'Civic' } })).toHaveLength(1);
        expect(await run(logic.webVerification, { data: { hypothesis: 'pads' } })).toEqual({ isVerified: true });
    });

    it('skips vision without a video and analyzes it when present', async () => {
        const { logic, deps } = actors();
        const prior = analysis({ diagnosis: 'prior' });
        expect(await run<AIAnalysis>(logic.visionAnalysis, { data: { visualAnalysis: prior } })).toBe(prior);
        const seen = await run<AIAnalysis>(logic.visionAnalysis, {
            data: { videoUrl: 'gs://v', vehicleContext: {}, sessionId: 's', userId: 'u', userQuery: 'q' },
        });
        expect(seen.diagnosis).toBe('seen on video');
        expect(deps.evidence.analyze).toHaveBeenCalledTimes(1);
    });

    it('fails soft on search, vector and memory outages', async () => {
        const { logic } = actors();
        const broken = { search: vi.fn().mockRejectedValue(new Error('down')) };
        expect(await run(logic.googleSearch, { data: { query: 'q' } })).toEqual({
            results: [],
            queryUsed: 'q',
            totalFound: 0,
        });
        expect(await run(logic.vectorSearch, { service: broken, data: { query: 'q', userId: 'u' } })).toEqual([]);
        expect(await run(logic.supermemorySearch, { service: broken, data: { query: 'q' } })).toEqual([]);
    });

    it('gathers recalls, history and similar cases in parallel, tolerating failures', async () => {
        const { logic } = actors();
        const result = await run(logic.gatherAllContext, {
            vehicleContext: { year: 2015, make: 'Honda', model: 'Civic', vin: 'VIN' },
            userQuery: 'grinding',
            userId: 'u-1',
            services: {
                nhtsa: { checkRecalls: vi.fn().mockResolvedValue([recall()]) },
                memory: { search: vi.fn().mockRejectedValue(new Error('down')) },
                vector: { search: vi.fn().mockResolvedValue([{ id: 'c1' }]) },
            },
        });
        expect(result).toEqual({ recalls: [recall()], history: [], vectors: [{ id: 'c1' }] });
    });
});
