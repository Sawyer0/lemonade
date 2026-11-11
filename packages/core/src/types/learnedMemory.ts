import { z } from 'zod';
import { SHARED_CONFIG } from '../config';
import { MemoryScopeSchema } from './memory';

/**
 * Learned memory (LM-31): the types for what the nightly review, the
 * playbook, the wiki, and global priors produce. The scope types themselves
 * (tech profile, vehicle record, shop settings) live in ./memory.
 */

/** One candidate memory version with a diff against the previous version. The previous version stays for rollback. */
export const MemoryVersionSchema = z.object({
    versionId: z.string().min(1),
    scope: MemoryScopeSchema,
    key: z.string().min(1),
    createdAt: z.string().datetime(),
    previousVersionId: z.string().min(1).nullable(),
    diff: z.object({
        added: z.array(z.string().min(1)),
        removed: z.array(z.string().min(1)),
        changed: z.array(z.string().min(1)),
    }),
    payload: z.unknown(),
});

export type MemoryVersion = z.infer<typeof MemoryVersionSchema>;

export const PlaybookCandidateSchema = z
    .object({
        rule: z.string().min(1),
        why: z.string().min(1),
        diagnosticStep: z.string().min(1),
        sourceCaseIds: z.array(z.string().min(1)).min(1),
        sourceEventIds: z.array(z.string().min(1)).min(1),
        confirmedByRepair: z.boolean(),
    })
    .strict();

export type PlaybookCandidate = z.infer<typeof PlaybookCandidateSchema>;

/** One rule per lesson, with a one-clause why, attached to the diagnostic step it affects. */
export const PlaybookEntrySchema = z.object({
    entryId: z.string().min(1),
    shopId: z.string().min(1),
    rule: z.string().min(1),
    why: z.string().min(1),
    diagnosticStep: z.string().min(1),
    status: z.enum(['candidate', 'active', 'stale', 'archived']),
    sourceCaseIds: z.array(z.string().min(1)).min(1),
    sourceEventIds: z.array(z.string().min(1)).min(1),
    confirmedByRepair: z.boolean(),
    lastUsedAt: z.string().datetime(),
    hitCount: z.number().int().min(0),
    pinned: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export type PlaybookEntry = z.infer<typeof PlaybookEntrySchema>;

/** Shop make/model wiki page: built only from confirmed repairs, quoting ledger entries verbatim. */
export const WikiPageSchema = z.object({
    pageId: z.string().min(1),
    shopId: z.string().min(1),
    family: z.string().min(1),
    quotes: z.array(
        z.object({
            ledgerEventId: z.string().min(1),
            caseId: z.string().min(1),
            quote: z.string().min(1),
        }),
    ),
    caseIds: z.array(z.string().min(1)),
    updatedAt: z.string().datetime(),
});

export type WikiPage = z.infer<typeof WikiPageSchema>;

/**
 * Nightly review output. Every output is stamped with the reflection
 * authority from SHARED_CONFIG.MEMORY; the validator rejects any other
 * value, and the synthesis may never write a vehicle fact, a diagnosis, or
 * a probability. Strict on purpose: an unexpected key fails validation
 * instead of being silently stripped.
 */
export const ReflectionOutputSchema = z
    .object({
        authority: z.literal(SHARED_CONFIG.MEMORY.REFLECTION_AUTHORITY),
        kind: z.literal('nightly_review'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shopId: z.string().min(1),
        techId: z.string().min(1).optional(),
        telemetry: z
            .object({
                casesReviewed: z.number().int().min(0),
                overrides: z.number().int().min(0),
                corrections: z.number().int().min(0),
                /** Share of reviewed cases with an override / a correction; 0 when no cases were reviewed. */
                overrideRate: z.number().min(0).max(1),
                correctionRate: z.number().min(0).max(1),
            })
            .strict(),
        synthesis: z.string(),
        playbookCandidates: z.array(PlaybookCandidateSchema),
        retiredClaimIds: z.array(z.string().min(1)),
        wikiFamilies: z.array(z.string().min(1)),
    })
    .strict();

export type ReflectionOutput = z.infer<typeof ReflectionOutputSchema>;

export const NightlyAlertSchema = z.object({
    alertId: z.string().min(1),
    reason: z.enum(['missed', 'failed']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shopId: z.string().min(1),
    techId: z.string().min(1).optional(),
    retryCount: z.number().int().min(0),
    createdAt: z.string().datetime(),
});

export type NightlyAlert = z.infer<typeof NightlyAlertSchema>;

/**
 * Global prior: only anonymized aggregates from shops that opt in. Strict on
 * purpose: a VIN or any customer field in the payload fails validation.
 * The aggregation floor (at least 2 shops, at least 5 cases) keeps a
 * one-shop or one-case "aggregate" from identifying anyone.
 */
export const AnonymizedAggregateSchema = z
    .object({
        vehicleFamily: z.string().min(1),
        symptomCategory: z.string().min(1),
        fixCategory: z.string().min(1),
        shopCount: z.number().int().min(2),
        caseCount: z.number().int().min(5),
    })
    .strict();

export type AnonymizedAggregate = z.infer<typeof AnonymizedAggregateSchema>;
