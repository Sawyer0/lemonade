# XState Inspector Integration

## Overview
The XState Inspector is now integrated into the Mechanic Reasoning flow. When enabled, it provides real-time visualization of:
- State transitions (idle → gathering_context → intuition → investigating → vision_verifying → synthesizing)
- Context changes (nhtsaResults, visualAnalysis, etc.)
- Actor invocations (generateIntuition, webVerification, visionAnalysis)
- Event firing

## How to Enable

### Option 1: Environment Variable (Recommended)
Add to your `.env.local`:
```
XSTATE_INSPECTOR=true
```

Then restart your Next.js server:
```bash
npm run dev
```

### Option 2: Temporary (Current Session Only)
```bash
# Windows (PowerShell)
$env:XSTATE_INSPECTOR="true"; npm run dev

# macOS/Linux
XSTATE_INSPECTOR=true npm run dev
```

## Accessing the Inspector

Once enabled:
1. The machine will automatically connect to **Stately Studio's cloud inspector**
2. A browser tab will open automatically at `https://stately.ai/registry/inspect`
3. You'll see your machine labeled with the session ID

## What You'll See

The inspector visualizes:
- **Current State**: Highlighted node in the state chart
- **Context**: Live data (vehicleContext, nhtsaResults, user query, etc.)
- **Events**: History of all events sent to the machine
- **Actors**: Which actors are currently running (e.g., `generateIntuition` using Pro model)

## Example Use Cases

### Debugging Parallel States
Watch the `investigating` parallel state to see:
- `search` region (Google search actor)
- `verification` region (webVerification actor)  
Both completing independently before transitioning to `vision_verifying`.

### Verifying Model Selection
Check the actor invocations to confirm:
- `generateIntuition` is using `gemini-2.5-pro`
- `visionAnalysis` checks local triage first
- Cost-saving decisions are being made correctly

### Understanding Flow
Trace the full diagnostic path:
1. **idle** → DIAGNOSE event
2. **gathering_context** → Promise.all(NHTSA, Memory, Vector)
3. **intuition** → Pro model reasoning
4. **investigating** → Web search + verification (parallel)
5. **vision_verifying** → Local model or cloud fallback
6. **synthesizing** → Final output

## Performance Note

The inspector adds minimal overhead (~5-10ms per transition). It's safe to leave enabled during development, but should be disabled in production via environment variable.

## Troubleshooting

**Inspector not opening?**
- Check that `XSTATE_INSPECTOR=true` in your `.env.local`
- Restart the Next.js dev server
- Check browser console for any errors

**Connection issues?**
- Ensure you have internet access (cloud inspector requires it)
- Check firewall settings
- Try refreshing the inspector page

**Local-only option?**
If you need offline inspection, you can self-host the inspector:
```bash
npm install @statelyai/inspect --save-dev
npx @statelyai/inspect
```
Then update the code to use `createInspector({ server: { port: 8888 } })` instead of `createBrowserInspector()`.
