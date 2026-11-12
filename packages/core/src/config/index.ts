import { GEMINI_EMBEDDING_MODEL, GEMINI_FLASH_MODEL, GEMINI_LIVE_VERTEX_MODEL, GEMINI_PRO_MODEL } from './models';

export const SHARED_CONFIG = {
    // AI Models
    AI_MODELS: {
        CHAT_MODEL: GEMINI_FLASH_MODEL,
        LIVE_MODEL: GEMINI_LIVE_VERTEX_MODEL,
        EMBEDDING: GEMINI_EMBEDDING_MODEL,
        // Agent models (Mechanic System 2 reasoning)
        AGENT: {
            BRAIN: GEMINI_PRO_MODEL, // Deep diagnostic reasoning (intuition state)
            WORKER: GEMINI_FLASH_MODEL, // Simple tasks (gathering, investigating, synthesizing)
        },
        // Start: Gemini 2.5 Flash Specs
        SPECS: {
            MAX_IMAGES_PER_PROMPT: 3000,
            MAX_INLINE_FILE_SIZE_MB: 7,
            MAX_GCS_IMAGE_SIZE_MB: 30,
            MAX_GCS_DOC_SIZE_MB: 50,
            MAX_VIDEO_LENGTH_MINUTES: 45,
            MAX_AUDIO_LENGTH_HOURS: 8.4,
            SUPPORTED_MIME_TYPES: {
                IMAGES: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'],
                DOCS: ['application/pdf', 'text/plain'],
                VIDEO: [
                    'video/x-flv',
                    'video/quicktime',
                    'video/mpeg',
                    'video/mpegs',
                    'video/mpg',
                    'video/mp4',
                    'video/webm',
                    'video/wmv',
                    'video/3gpp',
                ],
                AUDIO: [
                    'audio/x-aac',
                    'audio/flac',
                    'audio/mp3',
                    'audio/m4a',
                    'audio/mpeg',
                    'audio/mpga',
                    'audio/mp4',
                    'audio/ogg',
                    'audio/pcm',
                    'audio/wav',
                    'audio/webm',
                ],
            },
            DEFAULTS: {
                TEMPERATURE: 1.0,
                TOP_P: 0.95,
                TOP_K: 64,
                CANDIDATE_COUNT: 1,
            },
        },
        // End: Gemini 2.5 Flash Specs
    },

    PRICING: {
        // per 1M tokens
        STANDARD: {
            // Gemini 2.5 Flash
            INPUT: 0.1, // Text, Image, Video
            AUDIO_INPUT: 2.0,
            OUTPUT: 0.4, // Text output
            CACHED_INPUT: 0.025,
            CACHED_AUDIO: 0.5,
        },
        LIVE: {
            // Gemini 2.5 Flash Live API
            INPUT_TEXT: 0.6,
            INPUT_AUDIO: 3.0,
            INPUT_VIDEO: 3.0,
            OUTPUT_TEXT: 2.0,
            OUTPUT_AUDIO: 13.0,
        },
    },

    SUBSCRIPTION: {
        PRO_USER_MAX_VIDEO_MINUTES: 10,
        LIVE_VIDEO_MIN_TIME_BETWEEN_FRAMES_MS: 1000, // 1 FPS
        PRO_USER_MAX_AUDIO_MINUTES: 35, // New: Max cumulative audio minutes for Pro users
        LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS: 2000, // New: Min time between live audio chunks (ms)
    },

    AI_SETTINGS: {
        MAX_CHAT_HISTORY_TOKENS: 4000, // Roughly 10-15 messages depending on length
    },

    // Memory scopes (LM-31): users configure nothing; memory fills itself from the work.
    MEMORY: {
        TECH_PROFILE_MAX_CHARS: 1500, // Tech profile injected at session start, frozen for the session
        VEHICLE_SUMMARY_MAX_CHARS: 2000, // Vehicle record summary, always on; full ledger fetched on demand
        PLAYBOOK_STALE_DAYS: 90, // Unused playbook entries go stale (not injected)
        PLAYBOOK_ARCHIVE_DAYS: 180, // Stale entries are archived; never deleted, always recoverable
        GLOBAL_PRIORS_ENABLED: false, // Global priors come later, behind this flag
        REFLECTION_AUTHORITY: 'reflection_only', // Every nightly-review output is stamped with this
    },

    // Case-shaped context (LM-21): every model call is built from a fixed
    // system prompt, one ledger snapshot, and the recent turns. The snapshot
    // is never compressed; only raw tool output and old turns are.
    CONTEXT: {
        TOOL_RESULT_WINDOW_SHARE: 0.3, // Tool results are capped at ~30% of the context window
        RECENT_TURN_LIMIT: 20, // Recent turns kept verbatim per model call
        HANDOFF_SUMMARY_MAX_CHARS: 2000, // Cap on the compaction handoff summary
        ESTIMATED_CHARS_PER_TOKEN: 4, // Character-based token estimate (no tokenizer in core)
    },

    // Test library (LM-34): typed diagnostic tests with costs and accuracies.
    // Unverified (LLM-drafted) entries get their hit/false-alarm rates shrunk
    // toward uninformative (0.5) until a human expert reviews them, so the
    // planner never trusts a draft as much as a reviewed test.
    TEST_LIBRARY: {
        UNVERIFIED_SHRINK_FACTOR: 0.5,
        YAML_VERSION: 1,
    },

    // Knowledge graph (LM-38): seed graphs live in data/knowledge-graph/*.yaml.
    KNOWLEDGE_GRAPH: {
        YAML_VERSION: 1,
    },

    // Field-fix priors (LM-33): how often each cause was the confirmed fix
    // for a vehicle and DTC set. SMOOTHING_ALPHA is the Lidstone alpha:
    // 1 is Laplace smoothing, so an unseen hypothesis gets 1 / (N + K).
    PRIORS: {
        SMOOTHING_ALPHA: 1,
    },

    // Decision-theoretic diagnostic loop (LM-04): ranked differential,
    // cost-based next test, stop/escalate. Every threshold here is a
    // default the loop reads at run time; LM-37 owns calibrating the
    // commit threshold against LemonadeBench, LM-29 owns the per-case
    // budget the shop sets, LM-35 owns the escalation workflow these
    // rules hand off to. Until those land, the defaults below govern.
    DIAGNOSTIC_LOOP: {
        // Mass reserved for the explicit OTHER bucket ("none of the listed
        // causes") when a differential is built, before LLM proposals.
        OTHER_FLOOR: 0.05,
        // Probability each LLM-proposed hypothesis gets. The LLM names a
        // cause; it never sets a number — every proposal gets this same
        // floor, taken proportionally from the prior mass.
        LLM_PROPOSAL_PRIOR: 0.02,
        // Multiplier on a prior when a matching TSB exists for it.
        TSB_BOOST: 1.5,
        // Commit when the top hypothesis clears this. Calibrated by LM-37.
        COMMIT_PROBABILITY_THRESHOLD: 0.85,
        // Escalate when OTHER exceeds this: the listed causes probably do
        // not include the real one.
        OTHER_ESCALATE_THRESHOLD: 0.25,
        // A safety-critical fault (brakes, steering, airbags, HV,
        // hydraulics) may not be released while its probability is above
        // this.
        SAFETY_RELEASE_MAX_PROBABILITY: 0.01,
        // A test must beat this hit rate to count as a challenger: a
        // negative result has to be able to disprove the leader.
        CHALLENGER_MIN_HIT_RATE: 0.8,
        // Hard cap on workup rounds per run; hitting it escalates.
        MAX_ROUNDS: 10,
        // Shop labor rate, dollars per minute ($120/hour).
        LABOR_RATE_USD_PER_MINUTE: 2,
        // Downtime cost of the vehicle being out of service, per minute.
        DOWNTIME_USD_PER_MINUTE: 1,
        // Risk priced into a test by its safety class, dollars per run.
        RISK_USD_BY_SAFETY_CLASS: { routine: 0, caution: 25, hazardous: 150 },
        // Default per-case spend cap when the shop sets none (LM-29).
        DEFAULT_BUDGET_USD: 500,
    },

    FINISH_GATE: {
        // Challenger + checklist + independent gate attempts before the
        // diagnosis is withheld and the abstain handoff is spoken
        // instead (LM-19). The attempt count includes the first try.
        MAX_ATTEMPTS: 3,
    },

    THINKING_LEVEL: 'high' as 'high' | 'low', // 'high' for depth/default, 'low' for speed

    // Google Cloud
    GCLOUD: {
        PROJECT_ID: process.env.GCLOUD_PROJECT || 'lemonade-3c4e7',
        MEDIA_BUCKET: process.env.GCLOUD_MEDIA_BUCKET || 'lemonade-3c4e7.firebasestorage.app',
    },

    // Tavily web search (mechanic tool)
    TAVILY: {
        API_KEY: process.env.TAVILY_API_KEY,
    },

    // Observability / LangSmith
    OBSERVABILITY: {
        // When true, LangSmith tracing is enabled for AI calls
        LANGSMITH_ENABLED: process.env.LANGCHAIN_TRACING_V2 === 'true',
        // Optional project name for LangSmith; falls back to env/default
        LANGSMITH_PROJECT: process.env.LANGCHAIN_PROJECT || 'lemonade-master-tech',
    },
} as const;

export * from './brandTokens';
