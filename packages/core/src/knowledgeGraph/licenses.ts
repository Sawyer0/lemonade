import { z } from 'zod';

// --- License manifest (LM-38) ---
// Every outside source the knowledge graph and its decoders draw on is
// recorded here, with the license as verified on 2026-11-11 against the
// source itself (GitHub license API for the repos, the standard's own
// terms for the SAE material). Nothing below is a guess: where the
// provenance does not clear the data for use, the entry says so and the
// data is NOT vendored. The manifest check in the tests fails if an entry
// is missing a license, a status, or a note, and if a graph seed cites a
// source id that is not in this manifest.

export const SourceStatusSchema = z.enum(['vendored', 'separate-asset', 'not-vendored', 'excluded']);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SourceLicenseSchema = z
    .object({
        /** Stable id cited by graph seed files and decoders. */
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Source ids are lowercase slugs'),
        name: z.string().min(1),
        sourceUrl: z.string().url(),
        license: z.string().min(1),
        spdxId: z.string().min(1),
        status: SourceStatusSchema,
        /** What is and is not used, and what must happen before it can be used. */
        note: z.string().min(1),
        verifiedAt: z.string().min(1),
    })
    .strict();
export type SourceLicense = z.infer<typeof SourceLicenseSchema>;

export const SOURCE_LICENSES: readonly SourceLicense[] = [
    {
        id: 'opendbc',
        name: 'commaai/opendbc DBC files',
        sourceUrl: 'https://github.com/commaai/opendbc',
        license: 'MIT License',
        spdxId: 'MIT',
        status: 'separate-asset',
        note: 'Verified MIT (Copyright (c) 2020, comma.ai, Inc.) via the GitHub license API. '
            + 'DBC files are a separate data asset loaded at runtime; none are vendored here. '
            + 'Only the DBC text parser in decoders/dbc.ts ships, and it reads any DBC text, '
            + 'so a vehicle-specific DBC is fetched under its own terms when needed.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'obdb-saej1979',
        name: 'OBDb SAEJ1979 standard PID definitions',
        sourceUrl: 'https://github.com/OBDb/SAEJ1979',
        license: 'Creative Commons Attribution Share Alike 4.0 International',
        spdxId: 'CC-BY-SA-4.0',
        status: 'separate-asset',
        note: 'Verified CC-BY-SA-4.0 via the GitHub license API. The OBDb signal sets are a '
            + 'separate data asset, kept out of this repo: model-specific PIDs are loaded at '
            + 'runtime from the OBDb repository for the vehicle in hand, with attribution and '
            + 'share-alike preserved. Only the SAE J1979 standard Mode 01 formulas, which the '
            + 'standard itself defines, are implemented in decoders/pid.ts.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'dtc-database',
        name: 'Wal33D/dtc-database SQLite',
        sourceUrl: 'https://github.com/Wal33D/dtc-database',
        license: 'MIT License (repository code only)',
        spdxId: 'MIT',
        status: 'not-vendored',
        note: 'Provenance does NOT clear this data for use. The repository is MIT-licensed, '
            + 'but its 28,220+ DTC descriptions include 9,415 generic SAE J2012 definitions, '
            + 'and J2012 text is copyrighted by SAE: an MIT license on the container does not '
            + 'license the SAE text inside it. The SQLite is therefore NOT vendored and no '
            + 'description from it ships. DTC text comes only from the generic-descriptions '
            + 'table already in packages/core/src/dtc/descriptions.ts, via decoders/dtcText.ts, '
            + 'and manufacturer-specific codes get no invented description.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'sae-j2012',
        name: 'SAE J2012 diagnostic trouble code definitions',
        sourceUrl: 'https://www.sae.org/standards/content/j2012_202405/',
        license: 'Proprietary (SAE International)',
        spdxId: 'LicenseRef-Proprietary-SAE-J2012',
        status: 'not-vendored',
        note: 'J2012 text is copyrighted by SAE International. Only the code structure (system '
            + 'letter, designator, subsystem digit) and the generic descriptions already carried '
            + 'in packages/core/src/dtc/descriptions.ts are used; no J2012 text is copied in.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'sae-j1939-digital-annex',
        name: 'SAE J1939 Digital Annex (SPN names)',
        sourceUrl: 'https://www.sae.org/standards/content/j1939da_202311/',
        license: 'Proprietary (SAE International, licensed)',
        spdxId: 'LicenseRef-Proprietary-SAE-J1939DA',
        status: 'not-vendored',
        note: 'SPN names live in the licensed SAE J1939 Digital Annex (see pretty_j1939). '
            + 'No SPN name table ships: decoders/dm1.ts returns the SPN number only, with '
            + 'spnName null, until a licensed annex is acquired. The FMI 0-31 table in '
            + 'decoders/dm1.ts is our own table of the failure-mode meanings from SAE J1939-73.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'sae-j1939-73',
        name: 'SAE J1939-73 application layer diagnostics (DM1, FMI)',
        sourceUrl: 'https://www.sae.org/standards/content/j1939/73_202405/',
        license: 'Proprietary (SAE International)',
        spdxId: 'LicenseRef-Proprietary-SAE-J1939-73',
        status: 'not-vendored',
        note: 'The DM1 frame layout (PGN 65226) and the FMI 0-31 meanings are implemented from '
            + 'the standard as published summaries describe them; no SAE text is copied in. '
            + 'The standard itself is not vendored.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'python-obd',
        name: 'python-OBD',
        sourceUrl: 'https://github.com/brendan-w/python-OBD',
        license: 'GNU General Public License v3.0',
        spdxId: 'GPL-3.0',
        status: 'excluded',
        note: 'GPL-3.0 code must not ship in this codebase. python-OBD is used only as a '
            + 'reference for how OBD-II requests and responses are framed; no code from it is '
            + 'copied, and the PID decoder in decoders/pid.ts is written from the SAE J1979 '
            + 'formulas directly.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'nhtsa-recalls',
        name: 'NHTSA recalls API (api.nhtsa.gov)',
        sourceUrl: 'https://api.nhtsa.gov/recalls/recallsByVehicle',
        license: 'Public data (U.S. Government)',
        spdxId: 'LicenseRef-Public-US-Government',
        status: 'separate-asset',
        note: 'Recall records are U.S. Government public data, fetched at runtime through the '
            + 'existing NHTSA service (INHTSAService). No recall data is vendored; the graph '
            + 'seed only carries entries verified against the NHTSA record or marked llm-draft.',
        verifiedAt: '2026-11-11',
    },
    {
        id: 'lemonade-seed',
        name: 'Lemonade seed graph (own work)',
        sourceUrl: 'https://github.com/Sawyer0/lemonade',
        license: 'Apache-2.0',
        spdxId: 'Apache-2.0',
        status: 'vendored',
        note: 'The first-case seed graph in data/knowledge-graph/first-case.yaml is written for '
            + 'this repo under its Apache-2.0 license. Its entries are LLM drafts and stay '
            + 'unverified until a human expert reviews them.',
        verifiedAt: '2026-11-11',
    },
];

/** Looks a source up by the id graph seeds cite. Unknown ids are a manifest gap, not a guess. */
export function sourceLicenseById(sourceId: string): SourceLicense | undefined {
    return SOURCE_LICENSES.find((entry) => entry.id === sourceId);
}

/**
 * Checks the manifest itself: every entry carries a license, an SPDX id, a
 * status and a note, ids are unique, and no entry claims a vendored status
 * for data whose provenance does not clear it. Returns the problems found;
 * an empty list means the manifest is sound.
 */
export function checkLicenseManifest(): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const entry of SOURCE_LICENSES) {
        const parsed = SourceLicenseSchema.safeParse(entry);
        if (!parsed.success) {
            problems.push(
                `Source ${entry.id} fails validation: ${parsed.error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('; ')}`,
            );
        }
        if (seen.has(entry.id)) {
            problems.push(`Duplicate source id in license manifest: ${entry.id}`);
        }
        seen.add(entry.id);
        if (entry.status === 'vendored' && entry.id !== 'lemonade-seed') {
            problems.push(`Source ${entry.id} claims vendored status for outside data`);
        }
    }
    return problems;
}
