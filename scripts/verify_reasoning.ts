// Direct relative imports to bypass module resolution issues
import { createContainer } from '../packages/infrastructure/src/di/container';
import { TYPES } from '../packages/infrastructure/src/di/types';
import type { 
    IMechanicReasoningService, 
    ReasoningInput,
    ISessionRepository,
    IVectorRepository,
    IMemoryService
} from '../packages/core/src/index';

// --- MOCKS ---
const MockSessionRepository = {
    create: async () => { },
    updateAnalysis: async () => { },
    addMessage: async () => { },
    getHistory: async () => null,
    delete: async () => { },
    updateStatus: async () => { },
    flagSafetyStop: async () => { },
    findById: async () => null,
    updateVideo: async () => { },
    findByVehicleId: async () => [],
    findByUserId: async () => [],
    updateComplaint: async () => { },
    updateCumulativeVideoDuration: async () => { },
    updateLastProcessedFrameTimestamp: async () => { },
    updateCumulativeAudioDuration: async () => { },
    updateLastProcessedAudioChunkTimestamp: async () => { },
    saveXStateSnapshot: async () => { console.log("   [MockDB] Saving Snapshot..."); },
    getXStateSnapshot: async () => null,
    clearXStateSnapshot: async () => { console.log("   [MockDB] Clearing Snapshot..."); }
};

const MockVectorRepo = {
    search: async () => { console.log("   [MockVector] Search returning empty."); return []; },
    addCase: async () => { },
    findSimilar: async () => []
};

const MockSupermemory = {
    search: async () => { console.log("   [MockMemory] Search returning empty."); return []; },
    addDocument: async () => { }
};

async function verifyReasoning() {
    console.log("🔧 Verifying Mechanic Reasoning (System 2)...\n");

    // 1. Bootstrap DI
    const container = createContainer();

    // 2. CRITICAL: Unbind real services and bind mocks BEFORE resolving MechanicReasoningService
    console.log("🔄 Rebinding mocks for isolated testing...");
    if (container.isBound(TYPES.SessionRepository)) await container.unbind(TYPES.SessionRepository);
    if (container.isBound(TYPES.VectorRepository)) await container.unbind(TYPES.VectorRepository);
    if (container.isBound(TYPES.SupermemoryService)) await container.unbind(TYPES.SupermemoryService);

    // Bind mocks
    container.bind<ISessionRepository>(TYPES.SessionRepository).toConstantValue(MockSessionRepository as unknown as ISessionRepository);
    container.bind<IVectorRepository>(TYPES.VectorRepository).toConstantValue(MockVectorRepo as unknown as IVectorRepository);
    container.bind<IMemoryService>(TYPES.SupermemoryService).toConstantValue(MockSupermemory as unknown as IMemoryService);
    console.log("✅ Mocks bound successfully.\n");

    // 3. NOW resolve the service (it will receive the mocked dependencies)
    const service = await container.getAsync<IMechanicReasoningService>(TYPES.MechanicReasoningService);

    // 4. Define Scenario
    const input: ReasoningInput = {
        sessionId: `test-session-${Date.now()}`,
        userId: 'test-user-1',
        userQuery: "There's a loud rattling noise from the engine when I start it cold, but it goes away after a few seconds.",
        vehicleContext: {
            year: 2018,
            make: "Ford",
            model: "F-150",
            engine: "3.5L EcoBoost",
            vin: "1FTEW1E..."
        },
        complaint: "Cold start engine rattle"
    };

    console.log(`🚗 Vehicle: ${input.vehicleContext.year} ${input.vehicleContext.make} ${input.vehicleContext.model}`);
    console.log(`📝 Query: "${input.userQuery}"`);
    console.log("\n🧠 AI is Thinking (System 2)... This may take 30-60 seconds...\n");

    try {
        const result = await service.diagnose(input);

        console.log("\n✅ Diagnosis Complete!");
        console.log("--------------------------------------------------");
        console.log(`🔍 Hypothesis: ${result.intuition.hypothesis}`);
        console.log(`📊 Confidence: ${(result.intuition.confidence * 100).toFixed(1)}%`);
        console.log(`💡 Reasoning: ${result.intuition.reasoning}`);

        if (result.finalDiagnosis.decision === 'REQUEST_MORE_INFO') {
            console.log("\n🚧 Iterative Fallback Triggered (Good!)");
            console.log("The AI requested these checks:");
            result.finalDiagnosis.requiredActions.forEach(action => console.log(`  - ${action}`));
        } else {
            console.log(`\n🛑 Decision: ${result.finalDiagnosis.decision}`);
            console.log(`🗣️ User Output: ${result.finalDiagnosis.userOutput}`);
        }
        console.log("\n--------------------------------------------------");
    } catch (error) {
        console.error("❌ Verification Failed:", error);
    }
}

verifyReasoning().catch(console.error);
