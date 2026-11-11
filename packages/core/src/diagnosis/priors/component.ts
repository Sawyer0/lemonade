// NHTSA component matching (LM-33): TSB/recall matches are by component,
// never by substring.
//
// A NHTSA component is a colon-separated path, most specific last, e.g.
// "ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC
// CONVERTOR". Matching is segment-wise: one component matches another when
// one parsed segment list is a prefix of the other, so a query for the
// catalytic-convertor leaf matches a record filed at that leaf, and a
// record filed one level up still matches. A substring search would match
// "ENGINE" inside "ENGINE AND ENGINE COOLING" and "CATALYTIC CONVERTOR"
// inside unrelated text; segment equality forbids both.
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';

/** Splits a raw NHTSA component into its uppercased, trimmed segments. Throws on an empty component. */
export function parseNhtsaComponent(rawComponent: string): string[] {
    const segments = rawComponent
        .split(':')
        .map((segment) => segment.trim().toUpperCase())
        .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'NHTSA component must name at least one segment');
    }
    return segments;
}

/**
 * Segment-wise match: true when one parsed component is a prefix of the
 * other (equal counts as a match). "ENGINE" does not match
 * "ENGINE AND ENGINE COOLING" — the segments differ — and neither does any
 * substring of a segment.
 */
export function nhtsaComponentsMatch(queryComponent: string, recordComponent: string): boolean {
    const query = parseNhtsaComponent(queryComponent);
    const record = parseNhtsaComponent(recordComponent);
    const shorter = query.length <= record.length ? query : record;
    const longer = query.length <= record.length ? record : query;
    return shorter.every((segment, index) => segment === longer[index]);
}

// Curated component-to-cause map. Only components whose fix is unambiguous
// from the component itself are listed; anything unlisted is skipped by
// ingestion, never guessed. Keys are canonical paths (segments joined with
// ':'), written as NHTSA files them — note NHTSA's "CONVERTOR" spelling.
export const NHTSA_COMPONENT_CAUSES: Readonly<Record<string, string>> = {
    'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR': 'catalytic converter',
    'FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP': 'fuel pump',
    'AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE': 'driver frontal air bag inflator',
    'SERVICE BRAKES, HYDRAULIC:FOUNDATION COMPONENTS:DISC:ROTOR': 'brake rotor',
    'STEERING:ELECTRIC POWER ASSIST SYSTEM': 'electric power steering assist',
};

/**
 * The confirmed-fix hypothesis for an NHTSA component, or null when the
 * component is not in the curated map. A record component longer than a
 * mapped path still matches when the mapped path is its prefix; a shorter
 * or merely similar component never does.
 */
export function causeForNhtsaComponent(rawComponent: string): string | null {
    const segments = parseNhtsaComponent(rawComponent);
    for (const [mappedPath, cause] of Object.entries(NHTSA_COMPONENT_CAUSES)) {
        const mapped = mappedPath.split(':');
        if (mapped.length <= segments.length && mapped.every((segment, index) => segment === segments[index])) {
            return cause;
        }
    }
    return null;
}
