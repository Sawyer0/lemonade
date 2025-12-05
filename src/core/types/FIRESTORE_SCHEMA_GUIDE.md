# Firestore Schema Guide - Read First Before Adding Fields

## The Rule: Schema is Law

**CRITICAL**: Every Firestore field must be defined in the Zod schema BEFORE being used anywhere in the codebase.

**Why**: Ensures client and server stay in sync. Prevents the safety_stop/aiAnalysis.safety_alert mismatch that broke the app.

---

## How to Add a New Firestore Field

### 1. Define in Schema (this file)
```typescript
// src/core/types/models.ts
export const DiagnosticSessionSchema = z.object({
  // ... existing fields
  my_new_field: z.string(),  // ← Define here FIRST
});
```

### 2. Implement Repository Write
```typescript
// src/infrastructure/repositories/SessionAdminRepository.ts
async updateMyField(sessionId: string, value: string): Promise<void> {
    await adminDb.collection('sessions').doc(sessionId).update({
        my_new_field: value  // ← Must match schema field name exactly
    });
}
```

### 3. Implement Client Listener (if needed)
```typescript
// src/presentation/hooks/useLiveSession.ts or custom hook
useEffect(() => {
    const unsub = onSnapshot(doc(db, 'sessions', sessionId), (docSnap) => {
        const data = docSnap.data();
        console.log(data.my_new_field);  // ← Client reads same field name
    });
    return () => unsub();
}, [sessionId]);
```

---

## Schema Consistency Rules

### ❌ WRONG: Nested Inconsistency
```typescript
// Schema defines at root level
export const DiagnosticSessionSchema = z.object({
  safety_stop: z.boolean()
});

// But server writes nested
await updateDoc(doc(db, 'sessions', id), {
  'aiAnalysis.safety_stop': true  // ❌ Different path!
});

// Client reads root level
if (sessionData.safety_stop) { ... }  // ❌ Field never populated!
```

### ✅ RIGHT: Consistent Path
```typescript
// Schema defines at root level
export const DiagnosticSessionSchema = z.object({
  safety_stop: z.boolean()
});

// Server writes to same path
await updateDoc(doc(db, 'sessions', id), {
  safety_stop: true  // ✅ Matches schema
});

// Client reads same path
if (sessionData.safety_stop) { ... }  // ✅ Works!
```

---

## Field Naming Convention

- Use **snake_case** for all Firestore fields
- Be explicit: `safety_stop`, not `safetyStop` or `safety`
- Group related fields: `error_code`, `error_message` (not `errorCode`, `errorMsg`)

---

## When Adding a New Entity Type

1. Add Zod schema in this file (models.ts)
2. Create interface in `src/core/interfaces/I{Entity}Repository.ts`
3. Implement in `src/infrastructure/repositories/{Entity}Repository.ts`
4. Bind in DI container
5. **Run the Testing Checklist from Agent.md Section 5 BEFORE committing**

---

## Troubleshooting

**Client not receiving updates?**
1. Check schema field exists
2. Check repository writes to exact same field name
3. Check client listener uses `onSnapshot()` with cleanup
4. Check for typos (especially snake_case vs camelCase)

**Validation errors?**
1. Print the Firestore document: `console.log(docSnap.data())`
2. Compare against schema in this file
3. Check for missing required fields or type mismatches
