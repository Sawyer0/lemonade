// Repair-order free text (LM-33): the Predii-style pipeline — extract,
// normalize terms, cluster.
//
// Repair orders are written by techs, not a schema: "replaced cat + O2
// sensor", "catalytic convertor", "coil pack". Extraction scans the text
// for known repair phrases (up to three words, longest match first) and
// maps each to one canonical cause; clustering then counts how often each
// cause appears. A phrase with no entry in the tables is never invented —
// extraction only returns what it recognizes, and the caller records the
// rest as skipped.

// Canonical causes, each with the spellings and abbreviations techs use.
export const REPAIR_TERM_SYNONYMS: Readonly<Record<string, string>> = {
    cat: 'catalytic converter',
    'catalytic convertor': 'catalytic converter',
    'catalytic converter': 'catalytic converter',
    'o2 sensor': 'oxygen sensor',
    'o2 sensors': 'oxygen sensor',
    'oxygen sensor': 'oxygen sensor',
    'oxygen sensors': 'oxygen sensor',
    'spark plug': 'spark plugs',
    'spark plugs': 'spark plugs',
    plugs: 'spark plugs',
    'coil pack': 'ignition coil',
    'coil packs': 'ignition coil',
    'ignition coil': 'ignition coil',
    'ignition coils': 'ignition coil',
    'fuel pump': 'fuel pump',
    'maf sensor': 'mass airflow sensor',
    maf: 'mass airflow sensor',
    'mass airflow sensor': 'mass airflow sensor',
    'pcv valve': 'pcv valve',
    'purge valve': 'evap purge valve',
    'purge solenoid': 'evap purge valve',
    'evap purge valve': 'evap purge valve',
    thermostat: 'thermostat',
    alternator: 'alternator',
    'starter motor': 'starter motor',
    starter: 'starter motor',
    battery: 'battery',
    'air filter': 'air filter',
    injector: 'fuel injector',
    injectors: 'fuel injector',
    'fuel injector': 'fuel injector',
    'fuel injectors': 'fuel injector',
};

const MAX_PHRASE_WORDS = 3;

/** Lowercases, strips punctuation, collapses whitespace, and applies the synonym table. */
export function normalizeRepairTerm(term: string): string {
    const cleaned = term
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return REPAIR_TERM_SYNONYMS[cleaned] ?? cleaned;
}

/**
 * Extracts canonical causes from free text, in order of appearance. Scans
 * word by word, trying the longest phrase first, so "catalytic converter"
 * wins over a shorter match inside it. Unrecognized words are skipped.
 */
export function extractRepairTerms(text: string): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 0);
    const found: string[] = [];
    let index = 0;
    while (index < words.length) {
        let matched: string | null = null;
        let matchedWords = 0;
        for (let length = Math.min(MAX_PHRASE_WORDS, words.length - index); length >= 1; length--) {
            const phrase = words.slice(index, index + length).join(' ');
            const canonical = REPAIR_TERM_SYNONYMS[phrase];
            if (canonical) {
                matched = canonical;
                matchedWords = length;
                break;
            }
        }
        if (matched) {
            found.push(matched);
            index += matchedWords;
        } else {
            index += 1;
        }
    }
    return found;
}

export interface RepairTermCluster {
    hypothesis: string;
    observationCount: number;
}

/** Groups extracted terms into per-cause counts, most frequent first. */
export function clusterRepairTerms(terms: ReadonlyArray<string>): RepairTermCluster[] {
    const counts = new Map<string, number>();
    for (const term of terms) {
        const canonical = normalizeRepairTerm(term);
        counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([hypothesis, observationCount]) => ({ hypothesis, observationCount }))
        .sort((a, b) => b.observationCount - a.observationCount || a.hypothesis.localeCompare(b.hypothesis));
}
