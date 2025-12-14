Implementation Plan - Lint Error Resolution
This plan details the strategy to resolve 155 linting errors (90 errors, 65 warnings) across the lemonade-mvp codebase. The goal is to achieve a clean build and ensure strict adherence to 
Agent.md
 coding standards.

User Review Required
IMPORTANT

Syntax Errors in Mobile Components: The build is currently broken due to parsing errors in 
ChatScreen.native.tsx
 and 
MechanicScreen.native.tsx
. These will be prioritized.

Proposed Changes
We will tackle the errors in 5 distinct phases to minimize context switching.

Phase 1: Critical Syntax Fixes (Blockers)
Fix parsing errors that prevent compilation.

[MODIFY] 
ChatScreen.native.tsx
Fix missing closing brace }.
[MODIFY] 
MechanicScreen.native.tsx
Fix missing closing brace }.
Phase 2: React Native / Mobile Fixes
Resolve unused variables, any types, and hooks dependencies in the mobile app.

[MODIFY] 
app.config.ts
Name anonymous default export.
[MODIFY] 
NativeWebView.tsx
Fix keys in useEffect dependency array.
Remove unused variables.
[MODIFY] 
useGeminiSession.ts
Replace any with unknown or specific types.
Remove unused useEffect.
[MODIFY] 
useMobileChat.ts
Remove unused auth.
Fix any types.
[MODIFY] 
firebase/config.ts
Fix any types.
[MODIFY] 
metro.config.js
Fix require imports.
Phase 3: Backend Functions Fixes
Strict typing for Firebase Functions infrastructure.

[MODIFY] 
IVectorRepository.ts
Replace any with specific types (VectorResult, VectorMatch) from src/core/types.
[MODIFY] 
Logger.ts
Replace any in log payload with LogMetadata or structured object types.
Phase 4: Core & Application Logic Fixes
Fix logic errors and strict typing in the main shared codebase.

[MODIFY] 
MechanicReasoningService.ts
Remove unused error classes.
Replace recalls: any[] with recalls: SafetyRecall[].
Replace consensus: any[] with consensus: VectorMatch[].
Create internal ReasoningContext type for XState context to avoid any or unknown.
[MODIFY] 
mechanic.machine.ts
Heavy refactor of any types in XState machine definitions using ReasoningContext.
[MODIFY] 
ContextCacheService.ts
Fix any types in Vertex AI calls.
Phase 5: Presentation & Scripts
Cleanup UI components and maintenance scripts.

[MODIFY] 
AuthForm.tsx
Remove unused logger.
[MODIFY] 
AddVehicleModal.tsx
Escape apostrophes (HTML entities).
Fix @ts-ignore.
[MODIFY] 
scripts/*.js
Remove unused variables in scripts.
Verification Plan
Automated Tests
Run Lint: npm run lint (Must return 0 errors).
Type Check: npx tsc --noEmit on both project roots.