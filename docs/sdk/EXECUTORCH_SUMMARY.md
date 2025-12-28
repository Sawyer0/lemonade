# ExecuTorch Summary for SDK Maintenance

[← Back to Docs](../README.md) | [Full ExecuTorch Docs](../../execu-docs/README.md)

Quick reference for maintaining the FieldTech SDK's on-device AI components.

---

## Architecture Overview

ExecuTorch has **3 phases**:

```
1. Program Preparation (AOT)     2. Runtime Prep     3. Execution
   ────────────────────────         ───────────        ─────────
   torch.export() → ATen Dialect   Selective build    C++ runtime
   → Quantization (optional)       (link only used    Executor loads
   → Core ATen → Edge Dialect      kernels)           and runs .pte
   → Backend Delegate → .pte
```

**Key file format:** `.pte` (ExecuTorch program, flatbuffer serialized)

---

## Quantization (Critical for Mobile)

| Method | When to Use | Example |
|--------|-------------|---------|
| **TorchAO** | XNNPACK (CPU) | `8da4w` (int8 activation + int4 weight) |
| **PT2E** | QNN, CoreML, Vulkan | Backend-specific quantizers |

### Quantization Modes
- `8da4w` — int8 dynamic activation + int4 weight (recommended)
- `int8` — int8 weight-only
- `torchao:8da4w` — Low-bit kernels for Arm CPUs

### Workflow
```python
from torchao.quantization.pt2e.quantize_pt2e import prepare_pt2e, convert_pt2e

prepared = prepare_pt2e(model, quantizer)
for sample in calibration_data:
    prepared(sample)  # Calibrate
quantized = convert_pt2e(prepared)
```

---

## Android Backend Support

| Backend | Type | Use Case |
|---------|------|----------|
| **XNNPACK** | CPU | Default, maximum compatibility |
| **Qualcomm QNN** | NPU (Hexagon) | Snapdragon 8 Gen 1/2/3/Elite |
| **MediaTek NeuroPilot** | NPU | MediaTek chips |
| **Vulkan** | GPU | Cross-platform GPU acceleration |

### Supported Qualcomm Chips
SM8450 (8 Gen 1), SM8475 (8 Gen 1+), SM8550 (8 Gen 2), SM8650 (8 Gen 3), SM8750 (8 Elite)

### Android Integration
```kotlin
// Gradle (recommended)
implementation("org.pytorch:executorch-android:${version}")

// Or direct AAR
implementation(files("libs/executorch.aar"))
```

---

## LLM Export (SmolVLM2, Llama)

### Supported Models
- Llama 2/3/3.1/3.2
- Qwen 2.5/3
- Phi 3.5/4-mini
- **SmolLM2** ← Your local VLM

### Export Command
```bash
python -m executorch.extension.llm.export.export_llm \
  --config path/to/config.yaml
```

### Recommended Settings
```yaml
model:
  use_kv_cache: True
  use_sdpa_with_kv_cache: True
quantization:
  qmode: 8da4w
  embedding_quantize: 4,32
backend:
  xnnpack:
    enabled: True
```

---

## SDK Maintenance Checklist

### When updating llama.rn / ExecuTorch:

1. **Verify Core ATen ops** — Check ops used by SmolVLM2 are still in Core ATen set
2. **Re-benchmark quantization** — 4-bit should not introduce hallucinations in part ID
3. **Test on target chips** — SM8550 is your reference, but test SM8650/SM8750 for new devices
4. **Validate .pte export** — Ensure model exports without errors

### Key Files in execu-docs/source/
- `getting-started-architecture.md` — Runtime overview
- `quantization-overview.md` — Quantization workflow
- `backends-qualcomm.md` — Hexagon NPU integration
- `using-executorch-android.md` — AAR integration
- `llm/export-llm.md` — LLM export API

---

## Advanced: Qualcomm NPU Optimization

For maximum performance on Snapdragon chips, apply these optimizations:

| Optimization | What It Does |
|--------------|--------------|
| **Model Sharding** | Split model into 4 parts (`num_sharding=4`) to reduce memory pressure |
| **Mixed Precision** | KV cache in int8, LM head in 16a8w |
| **Graph Transforms** | Convert ops to accelerator-friendly formats |

### Export for Qualcomm NPU
```bash
python examples/qualcomm/oss_scripts/llama/llama.py \
  -b build-android -s ${SERIAL_NUM} -m SM8550 \
  --checkpoint consolidated.00.pth \
  --params params.json \
  --decoder_model llama3_2-3b_instruct \
  --compile_only
```

**Requirements:**
- Host machine: 64GB+ RAM
- Device: 16GB+ RAM (working on 12GB support)
- QNN SDK: 2.28.0+

---

## Advanced: .pte File Format

The `.pte` format is a modified flatbuffer with optional data segments:

```
┌───────────────────────────────────┐
│ Flatbuffer header                  │
├───────────────────────────────────┤
│ Extended header (optional)         │
│  - Program size                    │
│  - Segment offset                  │
├───────────────────────────────────┤
│ Flatbuffer program data            │
├───────────────────────────────────┤
│ Segment data (weights, etc.)       │
└───────────────────────────────────┘
```

**Magic bytes at offset 4:** `ET` followed by two digits (e.g., `ET12`)

**When debugging:**
1. Check magic bytes to verify file isn't corrupted
2. Extended header at offset 8 starts with `eh`
3. Segments are 4096-byte aligned for mmap compatibility

---

## Advanced: Troubleshooting

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Model won't load | Corrupted .pte | Check magic bytes, re-export |
| Slow inference | Debug build | Use release build |
| Slow inference | Not delegated | Verify backend delegation |
| High memory | Large segments | Enable model sharding |

### Debug Steps
1. **Enable logging:** Check ExecuTorch framework logs
2. **Verify delegation:** Use `verbose: True` in export config to see op delegation table
3. **Profile:** Use ExecuTorch Developer Tools for memory/time profiling

### Useful Commands
```bash
# Check .pte magic bytes
xxd model.pte | head -1
# Should show: 45 54 (ET)
```

---

## Resources

- [Architecture Overview](../../execu-docs/source/getting-started-architecture.md)
- [Quantization Overview](../../execu-docs/source/quantization-overview.md)
- [Qualcomm Backend](../../execu-docs/source/backends-qualcomm.md)
- [Android Integration](../../execu-docs/source/using-executorch-android.md)
- [LLM Export](../../execu-docs/source/llm/export-llm.md)
- [Troubleshooting FAQ](../../execu-docs/source/using-executorch-faqs.md)
- [Developer Tools](../../execu-docs/source/devtools-overview.md)
