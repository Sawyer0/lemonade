# Diagnostic Infrastructure SDK Extraction Plan

## Vision
A **general-purpose AI diagnostic infrastructure SDK** that enables developers to build AI-powered diagnostic/reasoning applications for **any domain** (HVAC, Electrical, Automotive, Appliances, Industrial, etc.).

The SDK provides:
- AI adapter abstractions (Gemini/Vertex AI orchestration)
- Streaming patterns (chat, live video/audio)
- Safety framework (configurable rules)
- Vector search infrastructure
- Observability (logging, tracing, evals)
- Billing/usage tracking
- Security (auth, rate limiting)

**Consumers provide:**
- Domain entities (Vehicle, HVACSystem, Appliance, etc.)
- Domain prompts (mechanic expertise, HVAC expertise, etc.)
- Domain safety rules (automotive hazards, electrical hazards, etc.)
- Domain external services (NHTSA, EPA, manufacturer APIs, etc.)

## SDK Identity
- **Package name:** `@fieldtech/infra-sdk`
- **Repository:** Separate repo (`github.com/fieldtech/infra-sdk`)
- **License:** Apache 2.0
- **AI Providers:** Multi-provider (Gemini, OpenAI, Claude)
- **Our automotive app** becomes a reference implementation / first consumer

---

## Planned Enhancements (Pre-Extraction)

> These features will be built in Lemonade first, then included in the SDK.

| Phase | Feature | Description |
|-------|---------|-------------|
| **1** | LLM Safety Rule Generation | Use Gemini to auto-generate 50+ safety rules from training data |
| **2** | Feedback Loop | Track rule firings, analyze effectiveness, auto-refine with LLM |
| **3** | XState Persistence | Persist machine state to Firestore for session recovery |
| **4** | Agentic Environment API | Expose `getAgent()`, `explainCurrentState()`, `onSafetyIntervention()` |

### Key SDK Features from Phase 4

```typescript
// Third-party developer usage (after SDK extraction):
import { FieldTechSDK } from '@fieldtech/infra-sdk';

const agent = sdk.getAgent();
agent.onSafetyIntervention((intervention) => {
  console.log(intervention.humanReadable);
  // "I paused because Local Perception detected a fuel leak..."
});
```

---

## Repository Strategy

**Separate Repository (Recommended for public SDK)**
```
diagnostic-infra-sdk/          # New repo: github.com/your-org/diagnostic-infra-sdk
├── packages/
│   └── sdk/                   # The SDK itself
└── examples/
    └── automotive/            # Reference implementation (subset of lemonade)

lemonade-mvp/                  # Your existing repo (consumes SDK)
├── packages/
│   └── automotive-domain/     # Your domain logic
└── src/                       # Your app
```
## SDK Package Structure

```
fieldtech-infra-sdk/
├── src/
│   ├── providers/                        # NEW: Multi-provider abstraction
│   │   ├── types.ts                      # IModelProvider, IEmbeddingProvider interfaces
│   │   ├── BaseModelProvider.ts          # Abstract provider base
│   │   ├── gemini/
│   │   │   ├── GeminiModelProvider.ts    # Gemini/Vertex implementation
│   │   │   └── GeminiEmbeddingProvider.ts
│   │   ├── openai/
│   │   │   ├── OpenAIModelProvider.ts    # OpenAI implementation
│   │   │   └── OpenAIEmbeddingProvider.ts
│   │   └── anthropic/
│   │       └── ClaudeModelProvider.ts    # Claude implementation
│   │
│   ├── ai/
│   │   ├── BaseMultimodalAdapter.ts      # Abstract chat + uploads (uses IModelProvider)
│   │   ├── BaseLiveStreamAdapter.ts      # Abstract frame/chunk analysis
│   │   ├── EmbeddingService.ts           # Uses IEmbeddingProvider
│   │   └── FunctionCallOrchestrator.ts   # Generic tool loop pattern
│   │
│   ├── safety/
│   │   └── ReactiveSafetyFramework.ts    # Configurable pattern-based safety
│   │
│   ├── observability/
│   │   ├── Logger.ts                     # Extract as-is
│   │   ├── TracingService.ts             # Extract as-is
│   │   └── EvalFramework.ts              # Generic eval runner (inject graders)
│   │
│   ├── security/
│   │   ├── EdgeSecurityService.ts        # Extract as-is
│   │   └── RateLimiter.ts                # Extract as-is
│   │
│   ├── repositories/
│   │   ├── BaseFirestoreRepository.ts    # Generic CRUD base
│   │   └── BaseVectorRepository.ts       # Abstract metadata schema
│   │
│   ├── external/
│   │   └── WebSearchService.ts           # Generic search (Google, Bing, etc.)
│   │
│   ├── billing/
│   │   └── BaseBillingService.ts         # Generic usage recording
│   │
│   ├── context/
│   │   └── RequestContext.ts             # Extract as-is
│   │
│   ├── config/
│   │   └── ConfigProvider.ts             # Generic env config
│   │
│   ├── di/
│   │   ├── types.ts                      # SDK_TYPES symbols
│   │   └── container.ts                  # Default container factory
│   │
│   └── index.ts                          # Public exports
│
├── package.json
├── tsconfig.json
├── LICENSE                               # Apache 2.0
└── README.md
```

---

## Consumer Examples (How Domains Use the SDK)

### Lemonade (Automotive) - Our App
```
lemonade-mvp/
├── packages/automotive-domain/
│   ├── entities/
│   │   └── Vehicle.ts, SafetyRecall.ts, DiagnosticSession.ts
│   ├── prompts/
│   │   └── mechanic.ts, safety.ts
│   ├── machines/
│   │   └── mechanicMachine.ts
│   ├── rules/
│   │   └── automotiveSafetyRules.ts   # Fuel leak, jack stand, HV patterns
│   └── external/
│       └── NHTSAService.ts            # NHTSA recall API
│
├── src/adapters/
│   ├── GeminiAutoAdapter.ts           # extends SDK.BaseMultimodalAdapter
│   └── GeminiAutoLiveAdapter.ts       # extends SDK.BaseLiveStreamAdapter
│
└── src/services/
    ├── MechanicReasoningService.ts    # Uses SDK orchestration + domain rules
    └── VehicleService.ts
```

### HVAC Domain (Another Consumer)
```
hvac-diagnostic-app/
├── packages/hvac-domain/
│   ├── entities/
│   │   └── HVACSystem.ts, MaintenanceRecord.ts
│   ├── prompts/
│   │   └── hvac-technician.ts         # "You are an HVAC expert..."
│   ├── rules/
│   │   └── hvacSafetyRules.ts         # Refrigerant leak, electrical hazards
│   └── external/
│       └── EPAService.ts              # EPA refrigerant regulations
│
└── src/adapters/
    └── GeminiHVACAdapter.ts           # extends SDK.BaseMultimodalAdapter
```

### Electrical Domain (Another Consumer)
```
electrical-diagnostic-app/
├── packages/electrical-domain/
│   ├── entities/
│   │   └── ElectricalPanel.ts, Circuit.ts
│   ├── prompts/
│   │   └── electrician.ts             # "You are a master electrician..."
│   ├── rules/
│   │   └── electricalSafetyRules.ts   # Live wire, arc flash, grounding
│   └── external/
│       └── NECService.ts              # National Electrical Code lookup
│
└── src/adapters/
    └── GeminiElectricalAdapter.ts     # extends SDK.BaseMultimodalAdapter
```

---

## Key Abstractions Required

### 0. Provider Abstraction (Multi-Provider Support)

**File:** `src/providers/types.ts`

```typescript
// Core provider interfaces - abstracts Gemini/OpenAI/Claude differences

export interface ModelConfig {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

export interface StreamChunk {
  text: string;
  finishReason?: 'stop' | 'length' | 'tool_call' | 'content_filter';
  usage?: UsageMetadata;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface GenerateResult {
  text: string;
  toolCalls?: ToolCall[];
  usage: UsageMetadata;
  finishReason: string;
}

export interface IModelProvider {
  readonly providerId: 'gemini' | 'openai' | 'anthropic';

  // Single response
  generate(
    messages: Message[],
    config: ModelConfig,
    tools?: ToolDefinition[]
  ): Promise<GenerateResult>;

  // Streaming response
  generateStream(
    messages: Message[],
    config: ModelConfig,
    tools?: ToolDefinition[]
  ): AsyncGenerator<StreamChunk, GenerateResult, unknown>;

  // Multimodal (image/video/audio)
  generateWithMedia(
    messages: Message[],
    media: MediaInput[],
    config: ModelConfig
  ): Promise<GenerateResult>;

  // Token counting
  countTokens(content: string | Message[]): Promise<number>;
}

export interface IEmbeddingProvider {
  readonly providerId: 'gemini' | 'openai' | 'anthropic';

  embedSingle(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  readonly dimensions: number;  // e.g., 768 for Gemini, 1536 for OpenAI
}
```

**File:** `src/providers/gemini/GeminiModelProvider.ts`

```typescript
@injectable()
export class GeminiModelProvider implements IModelProvider {
  readonly providerId = 'gemini' as const;
  private vertex: VertexAI;

  constructor(@inject(SDK_TYPES.ConfigProvider) config: IConfigProvider) {
    this.vertex = new VertexAI({
      project: config.get('GCLOUD_PROJECT'),
      location: config.get('GCLOUD_LOCATION', 'us-central1')
    });
  }

  async generate(messages: Message[], config: ModelConfig, tools?: ToolDefinition[]): Promise<GenerateResult> {
    const model = this.vertex.getGenerativeModel({ model: config.modelId });
    const result = await model.generateContent({
      contents: this.toGeminiFormat(messages),
      tools: tools ? this.toGeminiTools(tools) : undefined
    });
    return this.parseResult(result);
  }

  async *generateStream(messages: Message[], config: ModelConfig): AsyncGenerator<StreamChunk> {
    const model = this.vertex.getGenerativeModel({ model: config.modelId });
    const result = await model.generateContentStream({ contents: this.toGeminiFormat(messages) });

    for await (const chunk of result.stream) {
      yield { text: chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '' };
    }
  }

  // ... format conversion helpers
}
```

**File:** `src/providers/openai/OpenAIModelProvider.ts`

```typescript
@injectable()
export class OpenAIModelProvider implements IModelProvider {
  readonly providerId = 'openai' as const;
  private client: OpenAI;

  constructor(@inject(SDK_TYPES.ConfigProvider) config: IConfigProvider) {
    this.client = new OpenAI({ apiKey: config.get('OPENAI_API_KEY') });
  }

  async generate(messages: Message[], config: ModelConfig, tools?: ToolDefinition[]): Promise<GenerateResult> {
    const response = await this.client.chat.completions.create({
      model: config.modelId,
      messages: this.toOpenAIFormat(messages),
      tools: tools ? this.toOpenAITools(tools) : undefined
    });
    return this.parseResult(response);
  }

  async *generateStream(messages: Message[], config: ModelConfig): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: config.modelId,
      messages: this.toOpenAIFormat(messages),
      stream: true
    });

    for await (const chunk of stream) {
      yield { text: chunk.choices[0]?.delta?.content ?? '' };
    }
  }
}
```

**File:** `src/providers/anthropic/ClaudeModelProvider.ts`

```typescript
@injectable()
export class ClaudeModelProvider implements IModelProvider {
  readonly providerId = 'anthropic' as const;
  private client: Anthropic;

  constructor(@inject(SDK_TYPES.ConfigProvider) config: IConfigProvider) {
    this.client = new Anthropic({ apiKey: config.get('ANTHROPIC_API_KEY') });
  }

  async generate(messages: Message[], config: ModelConfig, tools?: ToolDefinition[]): Promise<GenerateResult> {
    const response = await this.client.messages.create({
      model: config.modelId,
      max_tokens: config.maxTokens ?? 4096,
      messages: this.toAnthropicFormat(messages),
      tools: tools ? this.toAnthropicTools(tools) : undefined
    });
    return this.parseResult(response);
  }

  async *generateStream(messages: Message[], config: ModelConfig): AsyncGenerator<StreamChunk> {
    const stream = await this.client.messages.stream({
      model: config.modelId,
      max_tokens: config.maxTokens ?? 4096,
      messages: this.toAnthropicFormat(messages)
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { text: event.delta.text };
      }
    }
  }
}
```

---

### 1. BaseMultimodalAdapter (Abstract Class)

**File:** `src/ai/BaseMultimodalAdapter.ts`

```typescript
@injectable()
export abstract class BaseMultimodalAdapter {
  constructor(
    @inject(SDK_TYPES.ModelProvider) protected modelProvider: IModelProvider,
    @inject(SDK_TYPES.Logger) protected logger: ILogger,
    @inject(SDK_TYPES.BillingService) protected billingService: IBillingService,
    @inject(SDK_TYPES.FunctionCallOrchestrator) protected fnOrchestrator: FunctionCallOrchestrator,
    @inject(SDK_TYPES.TracingService) protected tracer: TracingService
  ) {}

  // === ABSTRACT: Domain must implement ===
  protected abstract getModelConfig(): ModelConfig;
  protected abstract getSystemPrompt(context: unknown): string;
  protected abstract getResponseSchema(): ResponseSchema | undefined;
  protected abstract getTools(): ToolDefinition[];

  // === CONCRETE: Provider-agnostic orchestration ===
  async countTokens(content: string | Message[]): Promise<number> {
    return this.modelProvider.countTokens(content);
  }

  protected async recordBilling(userId: string, sessionId: string, usage: UsageMetadata): Promise<void> {
    await this.billingService.recordUsage({
      userId,
      sessionId,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      model: this.getModelConfig().modelId,
      timestamp: new Date()
    });
  }

  async *streamWithFunctionCalls(
    history: Message[],
    userMessage: string,
    context: unknown,           // Domain passes vehicleContext, etc.
    userId: string,
    sessionId: string
  ): AsyncGenerator<string, string, unknown> {
    const systemPrompt = this.getSystemPrompt(context);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    let accumulated = '';

    // Stream from provider (Gemini, OpenAI, or Claude)
    const stream = this.modelProvider.generateStream(
      messages,
      this.getModelConfig(),
      this.getTools()
    );

    for await (const chunk of stream) {
      accumulated += chunk.text;
      yield chunk.text;

      // Handle tool calls if present
      if (chunk.finishReason === 'tool_call') {
        const toolResults = await this.fnOrchestrator.handleToolCalls(
          chunk.toolCalls!,
          { userId, sessionId }
        );
        // Continue conversation with tool results...
      }
    }

    return accumulated;
  }

  async analyzeMedia(
    mediaUrl: string,
    mimeType: string,
    context: unknown,
    userId: string,
    sessionId: string
  ): Promise<unknown> {
    const systemPrompt = this.getSystemPrompt(context);
    const result = await this.modelProvider.generateWithMedia(
      [{ role: 'system', content: systemPrompt }],
      [{ url: mediaUrl, mimeType }],
      this.getModelConfig()
    );

    await this.recordBilling(userId, sessionId, result.usage);
    return this.parseResponse(result.text);
  }

  protected abstract parseResponse(text: string): unknown;
}
```

### 2. BaseVectorRepository (Abstract Class)

**File:** `src/repositories/BaseVectorRepository.ts`

```typescript
export interface VectorDocument<TMetadata = Record<string, unknown>> {
  id: string;
  content: string;
  vector: number[];
  metadata: TMetadata;
  similarity?: number;
}

@injectable()
export abstract class BaseVectorRepository<TMetadata = Record<string, unknown>> {
  constructor(
    @inject(SDK_TYPES.Logger) protected logger: ILogger,
    @inject(SDK_TYPES.EmbeddingService) protected embeddingService: IEmbeddingService
  ) {}

  // === ABSTRACT: Domain must implement ===
  protected abstract getCollectionName(): string;
  protected abstract getVectorFieldPath(): string;
  protected abstract mapMetadata(doc: FirebaseFirestore.DocumentData): TMetadata;

  // === CONCRETE: Generic vector operations ===
  async search(
    query: string,
    limit: number = 5,
    filter?: Partial<TMetadata>
  ): Promise<VectorDocument<TMetadata>[]> {
    const queryVector = await this.embeddingService.embedSingle(query);
    return this.findSimilar(queryVector, limit, filter);
  }

  async findSimilar(
    vector: number[],
    limit: number = 5,
    filter?: Partial<TMetadata>
  ): Promise<VectorDocument<TMetadata>[]> {
    let query = adminDb.collection(this.getCollectionName());

    // Apply filters
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined) query = query.where(key, '==', value);
      }
    }

    const results = await query.findNearest(this.getVectorFieldPath(), vector, {
      limit,
      distanceMeasure: 'COSINE'
    }).get();

    return results.docs.map(doc => ({
      id: doc.id,
      content: doc.data().content,
      vector: doc.data()[this.getVectorFieldPath()],
      metadata: this.mapMetadata(doc.data()),
      similarity: doc.data().distance
    }));
  }
}
```

### 3. ReactiveSafetyFramework (Configurable)

**File:** `src/safety/ReactiveSafetyFramework.ts`

```typescript
export interface SafetyTrigger {
  regex: RegExp;
  hazard: string;
  message: string;
  severity: 'warning' | 'critical';
}

export interface SafetyAssessment {
  safe: boolean;
  hazards: Array<{ type: string; message: string; severity: string }>;
  requiresIntervention: boolean;
}

@injectable()
export class ReactiveSafetyFramework {
  constructor(
    @inject(SDK_TYPES.Logger) private logger: ILogger,
    private triggers: SafetyTrigger[]   // Injected by domain
  ) {}

  assess(userMessage: string): SafetyAssessment {
    const detectedHazards: SafetyAssessment['hazards'] = [];

    for (const trigger of this.triggers) {
      if (trigger.regex.test(userMessage)) {
        detectedHazards.push({
          type: trigger.hazard,
          message: trigger.message,
          severity: trigger.severity
        });
      }
    }

    return {
      safe: detectedHazards.length === 0,
      hazards: detectedHazards,
      requiresIntervention: detectedHazards.some(h => h.severity === 'critical')
    };
  }
}
```

---

## SDK TYPES Symbols

**File:** `src/di/types.ts`

```typescript
export const SDK_TYPES = {
  // Providers (consumers bind their preferred provider)
  ModelProvider: Symbol.for('ModelProvider'),
  EmbeddingProvider: Symbol.for('EmbeddingProvider'),

  // AI Services
  EmbeddingService: Symbol.for('EmbeddingService'),
  FunctionCallOrchestrator: Symbol.for('FunctionCallOrchestrator'),

  // Observability
  Logger: Symbol.for('Logger'),
  TracingService: Symbol.for('TracingService'),
  ConfigProvider: Symbol.for('ConfigProvider'),

  // Security
  EdgeSecurityService: Symbol.for('EdgeSecurityService'),
  RateLimiter: Symbol.for('RateLimiter'),

  // External
  WebSearchService: Symbol.for('WebSearchService'),

  // Billing
  BillingService: Symbol.for('BillingService'),
  BillingRepository: Symbol.for('BillingRepository'),

  // Repositories
  VectorRepository: Symbol.for('VectorRepository'),
};
```

---

## SDK Public API (What Consumers Import)

```typescript
// Consumer's package.json
{
  "dependencies": {
    "@fieldtech/infra-sdk": "^1.0.0"
  }
}

// Consumer's code
import {
  // Providers (pick one or swap at runtime)
  GeminiModelProvider,
  GeminiEmbeddingProvider,
  OpenAIModelProvider,
  OpenAIEmbeddingProvider,
  ClaudeModelProvider,
  type IModelProvider,
  type IEmbeddingProvider,

  // AI Adapters (abstract bases - extend these)
  BaseMultimodalAdapter,
  BaseLiveStreamAdapter,
  FunctionCallOrchestrator,

  // Safety Framework
  ReactiveSafetyFramework,
  type SafetyTrigger,
  type SafetyAssessment,

  // Repositories
  BaseVectorRepository,
  BaseFirestoreRepository,
  type VectorDocument,

  // Observability
  Logger,
  TracingService,
  EvalFramework,

  // Security
  EdgeSecurityService,
  RateLimiter,

  // Billing
  BaseBillingService,

  // Context
  RequestContext,

  // DI
  SDK_TYPES,
  createContainer,

  // Types
  type ModelConfig,
  type StreamChunk,
  type ToolCall,
  type GenerateResult,
  type UsageMetadata,
  type Message,
  type ToolDefinition,
} from '@fieldtech/infra-sdk';
```

---

## Decisions Made

| Decision | Choice |
|----------|--------|
| **Package name** | `@fieldtech/infra-sdk` |
| **Repository** | Separate repo (`github.com/fieldtech/infra-sdk`) |
| **AI Providers** | Multi-provider: Gemini, OpenAI, Claude |
| **License** | Apache 2.0 |

---

## Implementation Phases

### Phase 1: Create SDK Repository & Scaffold
1. Create new repo `fieldtech-infra-sdk`
2. Initialize with npm, TypeScript, Apache 2.0 license
3. Setup package.json with peer dependencies:
   - `@google-cloud/vertexai` (optional)
   - `openai` (optional)
   - `@anthropic-ai/sdk` (optional)
   - `inversify` (required)
   - `firebase-admin` (optional, for Firestore repos)

### Phase 2: Implement Provider Abstraction
1. Create `src/providers/types.ts` - IModelProvider, IEmbeddingProvider interfaces
2. Create `src/providers/gemini/` - GeminiModelProvider, GeminiEmbeddingProvider
3. Create `src/providers/openai/` - OpenAIModelProvider, OpenAIEmbeddingProvider
4. Create `src/providers/anthropic/` - ClaudeModelProvider
5. Write tests for each provider

### Phase 3: Extract Generic Services (copy from lemonade-mvp)
1. Copy `Logger.ts` → `src/observability/Logger.ts`
2. Copy `TracingService.ts` → `src/observability/TracingService.ts`
3. Copy `EdgeSecurityService.ts` → `src/security/EdgeSecurityService.ts`
4. Copy `RateLimiter.ts` → `src/security/RateLimiter.ts`
5. Copy `RequestContext.ts` → `src/context/RequestContext.ts`
6. Copy `EmbeddingService.ts` → `src/ai/EmbeddingService.ts` (update to use IEmbeddingProvider)

### Phase 4: Create Abstract Base Classes
1. Create `src/ai/BaseMultimodalAdapter.ts` - uses IModelProvider
2. Create `src/ai/BaseLiveStreamAdapter.ts` - uses IModelProvider
3. Create `src/ai/FunctionCallOrchestrator.ts` - generic tool loop
4. Create `src/repositories/BaseVectorRepository.ts` - generic metadata type
5. Create `src/repositories/BaseFirestoreRepository.ts` - generic CRUD
6. Create `src/safety/ReactiveSafetyFramework.ts` - configurable rules
7. Create `src/billing/BaseBillingService.ts` - generic usage recording

### Phase 5: DI & Exports
1. Create `src/di/types.ts` - SDK_TYPES symbols
2. Create `src/di/container.ts` - createContainer() factory
3. Create `src/index.ts` - public API exports
4. Write README.md with getting started guide

### Phase 6: Refactor Lemonade App (Consumer)
1. Add `@fieldtech/infra-sdk` as dependency
2. Create `packages/automotive-domain/` with domain logic
3. Create `src/adapters/GeminiAutoAdapter.ts` extending BaseMultimodalAdapter
4. Update DI container to bind SDK + domain implementations
5. Remove duplicated infrastructure code
6. Run tests to verify everything works

---

## Files to Create in SDK (New Repo)

| File | Source (from lemonade-mvp) | Changes |
|------|---------------------------|---------|
| `src/providers/types.ts` | NEW | Provider interfaces |
| `src/providers/gemini/GeminiModelProvider.ts` | `GeminiCoreAdapter.ts` | Implement IModelProvider |
| `src/providers/openai/OpenAIModelProvider.ts` | NEW | Implement IModelProvider |
| `src/providers/anthropic/ClaudeModelProvider.ts` | NEW | Implement IModelProvider |
| `src/ai/BaseMultimodalAdapter.ts` | `GeminiFlashChatAndUploadsAdapter.ts` | Abstract, use IModelProvider |
| `src/ai/BaseLiveStreamAdapter.ts` | `GeminiFlashLiveStreamAdapter.ts` | Abstract, use IModelProvider |
| `src/ai/FunctionCallOrchestrator.ts` | `FunctionCallHandler.ts` | Generalize tool handlers |
| `src/ai/EmbeddingService.ts` | `EmbeddingService.ts` | Use IEmbeddingProvider |
| `src/safety/ReactiveSafetyFramework.ts` | `ReactiveSafetyService.ts` | Remove automotive rules |
| `src/observability/Logger.ts` | `Logger.ts` | Copy as-is |
| `src/observability/TracingService.ts` | `TracingService.ts` | Copy as-is |
| `src/observability/EvalFramework.ts` | `EvalRunner.ts` | Generalize graders |
| `src/security/EdgeSecurityService.ts` | `EdgeSecurityService.ts` | Copy as-is |
| `src/security/RateLimiter.ts` | `UpstashRateLimiter.ts` | Copy as-is |
| `src/repositories/BaseVectorRepository.ts` | `VectorRepository.ts` | Abstract metadata |
| `src/repositories/BaseFirestoreRepository.ts` | NEW | Generic CRUD pattern |
| `src/billing/BaseBillingService.ts` | `BillingService.ts` | Generic usage type |
| `src/context/RequestContext.ts` | `request-context.ts` | Copy as-is |
| `src/config/ConfigProvider.ts` | `EnvConfigProvider.ts` | Copy as-is |
| `src/di/types.ts` | `types.ts` | SDK-only symbols |
| `src/di/container.ts` | NEW | Factory function |
| `src/index.ts` | NEW | Public exports |
