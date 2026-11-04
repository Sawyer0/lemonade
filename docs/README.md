# Lemonade Documentation

Central hub for all project documentation.

---

## 📁 Documentation Structure

```
docs/
├── sdk/           # SDK architecture & maintenance
├── platform/      # Lemonade platform features
└── META/          # Project meta documentation
```

---

## SDK & Architecture

| Doc | Description |
|-----|-------------|
| [ExecuTorch Summary](./sdk/EXECUTORCH_SUMMARY.md) | On-device AI reference |
| [Architecture](./sdk/LEMONADE-ARCHITECTURE.md) | System architecture overview |
| [System Design](./sdk/LEMONADE-SYSTEM-DESIGN.md) | Detailed design docs |
| [Neuro-Symbolic System](./sdk/NEUROSYMBOLIC_SYSTEM.md) | AI reasoning architecture |
| [Agent Guidelines](./sdk/Agent.md) | Coding standards |

---

## Vendor References

Lemonade builds on these upstream docs; follow the official sources rather than copies:

- [Gemini API](https://ai.google.dev/gemini-api/docs) (models, Files API, video understanding, thinking)
- [LiveKit Agents](https://docs.livekit.io/agents/) (voice agent sessions, STT/TTS, realtime models)
- [ExecuTorch](https://pytorch.org/executorch/) (on-device inference)

---

## Platform Features

| Doc | Description |
|-----|-------------|
| [Features](./platform/FEATURES.md) | Complete feature map |
| [Server-Driven Gating](./platform/SERVERDRIVENGATING.md) | AI tool control |
| [Tool Audit](./platform/TOOL-AUDIT.md) | Tool usage analysis |
| [Evals](./platform/EVALS.md) | Evaluation framework |
