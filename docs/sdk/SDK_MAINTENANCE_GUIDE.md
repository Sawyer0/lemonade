# FieldTech SDK Maintenance Guide

Reference for maintaining the SDK across dependency updates, hardware changes, and safety requirements.

> **Maintainer's Role:** You are not just "fixing bugs"—you are maintaining a **Certified Safety Kernel**. You ensure that when a mechanic uses the SDK, the hardware (NPU), the logic (XState), and the intelligence (Cloud) all agree on what is safe.

---

## Maintenance Levels

| Level | Key Metric | Why it Matters |
|-------|------------|----------------|
| **Reactive** | Dependencies Updated | Keeps the system running on latest hardware |
| **Proactive** | Inference < 10ms | Ensures the "Reflex Arc" is faster than human error |
| **Strategic** | Logic Traceability | Provides an "Audit Trail" for insurance and compliance |

---

## 1. Hardware & Runtime (ExecuTorch Layer)

### Files to Monitor
- `mobile/services/LocalPerceptionService.ts`
- `mobile/constants/config.ts` (GPU_LAYERS, CONTEXT_SIZE)

### Maintenance Tasks

| Trigger | Action |
|---------|--------|
| New mobile chipset (Snapdragon 8 Gen 4, Apple A19) | Re-benchmark inference latency |
| llama.rn update | Validate 4-bit quantization still works |
| ExecuTorch delegate change | Re-export `.pte` files, test CoreATen ops |

### Critical Checks

**Operator Coverage:** Verify Core ATen ops are supported by latest backend delegates (Qualcomm Hexagon, Apple Neural Engine).

**Quantization Drift:** After any quantization tool update, re-benchmark to ensure 4-bit quantization hasn't introduced hallucinations in part identification.

### Validation Command
```bash
cd mobile && npm run benchmark:inference
```

---

## 2. Neuro-Symbolic Logic Maintenance

### Files to Monitor
- `packages/core/src/machines/mechanic.machine.ts`
- `packages/infrastructure/src/services/ReactiveSafetyService.ts`
- `packages/infrastructure/src/services/generated-safety-rules.json`

### Maintenance Tasks

| Trigger | Action |
|---------|--------|
| New LLM-generated rules | Verify no XState transition bypasses safety gates |
| XState upgrade | Re-run transition coverage tests |
| Neural model upgrade (SmolVLM2 → successor) | Verify model doesn't override symbolic safety rules |

### The "Semantic Gap"

Ensure neural detections correctly trigger symbolic states:
```
NPU Output: { obj: "fuel_leak", confidence: 0.95 }
    ↓ (Semantic Bridge)
XState: STOP_DANGER triggered
```

### Validation Command
```bash
npm run test:machines
npm run test:safety
```

---

## 3. Edge-to-Cloud Orchestration

### Files to Monitor
- `packages/infrastructure/src/services/MechanicReasoningService.ts`
- `mobile/hooks/useCameraVisionStream.ts`

### Maintenance Tasks

| Trigger | Action |
|---------|--------|
| Gemini API pricing change | Re-tune token budgets in prompts |
| New LLM provider (GPT-5, Claude 4) | Update adapters, validate output schema |
| Network latency regression | Audit `triageFrame()` batch sizes |

### Schema Validation

Every new LLM provider has different output formats. Adapters must normalize outputs before they hit deterministic logic.

### Validation Command
```bash
npm run test:integration -- --grep "reasoning"
```

---

## 4. Safety & Security Guardrails

> ⚠️ **This is your most important section.** The safety interlock is what makes this a "Safety Kernel," not just an app.

### Files to Monitor
- `packages/infrastructure/src/services/ReactiveSafetyService.ts`
- `packages/infrastructure/src/repositories/FirestoreSessionRepository.ts`

### Maintenance Tasks

| Trigger | Action |
|---------|--------|
| SDK version release | Benchmark safety gate latency (<10ms) |
| Firestore SDK update | Test XState snapshot recovery |
| Security vulnerability report | Audit regex patterns for ReDoS |

### Critical Audits

**Interlock Benchmark:** Verify XState transitions physically cannot bypass safety gates—not just that code runs.

**ReDoS Audit:** Regex-based triggers in `ReactiveSafetyService.ts` must be audited to prevent Regular Expression Denial of Service attacks that could freeze safety logic during critical repairs.

**Durable Sessions:** XState + Firestore snapshot recovery must work even if technician's phone dies mid-repair.

### Validation Command
```bash
npm run test:safety -- --benchmark
npm run e2e:smoke
```

---

## Release Checklist

Before each SDK release:

- [ ] Run full test suite: `npm run test`
- [ ] Benchmark inference on target devices
- [ ] Verify safety gates fire in <10ms
- [ ] Test XState persistence/recovery
- [ ] Audit regex patterns for ReDoS vulnerabilities
- [ ] Validate on both Android and iOS
- [ ] Update CHANGELOG.md
- [ ] Tag version in git

---

## Dependency Update Protocol

1. **Create branch**: `chore/update-<dependency>`
2. **Update dependency**: `npm update <package>`
3. **Run relevant tests** from sections above
4. **Benchmark** if performance-critical (especially for llama.rn, ExecuTorch)
5. **Audit security** if regex or safety-related
6. **Document** any breaking changes
7. **PR review** before merge

---

## Resources

- [ExecuTorch Documentation](https://pytorch.org/executorch/)
- [Building Better Agentic Systems with Neuro-Symbolic AI](https://www.youtube.com/watch?v=1xW8l2TfrCg)

