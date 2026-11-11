// Source licenses (LM-33): the license check, recorded per source.
//
// Checked 2026-11-11. The findings:
// - NHTSA complaints, recalls, and TSB summaries are U.S. federal
//   government data: public domain under 17 U.S.C. § 105. Approved for
//   production priors.
// - AutoRepairBench's *code* is MIT and its *paper* is CC BY 4.0, but the
//   dataset itself (Integrated_Data.json, 117,465 ECU/DTC pairs) has no
//   separate license file: the README says only that the data is "released
//   for research use" and to use it "only in line with applicable terms".
//   That is not an open dataset license, so it is recorded as
//   research-use-only and NOT approved for production: it may seed priors
//   and feed evals, with attribution to Zuo et al. (CIKM '26), but the
//   dataset must not be redistributed and its counts must not be presented
//   as production evidence. Re-check before any production use.
// - Repair-order text and Lemonade's own ledger are shop-owned: usable
//   inside the shop that owns them, and ledger outcomes only once an
//   expert has validated them (LM-35).
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { PriorSource, SourceLicense } from './types';

export const SOURCE_LICENSES: Readonly<Record<PriorSource, SourceLicense>> = {
    'nhtsa-complaints': {
        source: 'nhtsa-complaints',
        license: 'Public domain (U.S. federal government work, 17 U.S.C. § 105)',
        licenseStatus: 'public-domain',
        approvedForProduction: true,
        checkedOn: '2026-11-11',
        evidence: 'NHTSA flat files (complaints) and api.nhtsa.gov; U.S. federal data carries no copyright',
        notes: 'Complaints are owner reports, not confirmed fixes: they raise the prior for the component at fault, never a specific repair.',
    },
    'nhtsa-recalls': {
        source: 'nhtsa-recalls',
        license: 'Public domain (U.S. federal government work, 17 U.S.C. § 105)',
        licenseStatus: 'public-domain',
        approvedForProduction: true,
        checkedOn: '2026-11-11',
        evidence: 'NHTSA recalls API (api.nhtsa.gov/recalls/recallsByVehicle); U.S. federal data carries no copyright',
        notes: 'A recall names the component and the remedy, not a DTC: counts are vehicle-level (no DTC set).',
    },
    'nhtsa-tsb': {
        source: 'nhtsa-tsb',
        license: 'Public domain (U.S. federal government work, 17 U.S.C. § 105)',
        licenseStatus: 'public-domain',
        approvedForProduction: true,
        checkedOn: '2026-11-11',
        evidence: 'NHTSA TSB summaries (flat files); U.S. federal data carries no copyright',
        notes: 'TSB summaries are manufacturer guidance, not confirmed fixes: they raise the prior for the component at fault, never a specific repair.',
    },
    autorepairbench: {
        source: 'autorepairbench',
        license: 'No dataset license file; code MIT, paper CC BY 4.0; README: data "released for research use"',
        licenseStatus: 'research-use-only',
        approvedForProduction: false,
        checkedOn: '2026-11-11',
        evidence:
            'https://github.com/AutoRepairBench/AutoRepairBench — LICENSE is MIT (code), README dataset section states research use only, no dataset license file',
        notes: 'Eval and seed priors only, with attribution to Zuo et al., CIKM ’26 (DOI 10.1145/3799682.3840599). Do not redistribute Integrated_Data.json. Re-check the license before any production use.',
    },
    'repair-order': {
        source: 'repair-order',
        license: 'Shop-owned repair-order text; internal use within the owning shop only',
        licenseStatus: 'shop-owned',
        approvedForProduction: true,
        checkedOn: '2026-11-11',
        evidence: 'Repair orders belong to the shop that wrote them; no third-party license applies',
        notes: 'Only the owning shop’s own orders may be ingested. Orders from another shop need that shop’s agreement first.',
    },
    'lemonade-ledger': {
        source: 'lemonade-ledger',
        license: 'Shop-owned ledger data; only expert-validated confirmed outcomes',
        licenseStatus: 'shop-owned',
        approvedForProduction: true,
        checkedOn: '2026-11-11',
        evidence: 'Lemonade case ledger (packages/core/src/types/case.ts OutcomePayload, confirmed outcomes)',
        notes: 'An outcome counts only with an ExpertValidation attestation (LM-35 owns that workflow). Unvalidated or unconfirmed outcomes are skipped.',
    },
};

/** The recorded license check for one source. */
export function licenseFor(source: PriorSource): SourceLicense {
    return SOURCE_LICENSES[source];
}

/**
 * Refuses a source that is not approved for production priors — currently
 * AutoRepairBench, whose dataset is research-use-only. Eval and seed use
 * goes through ingestion directly and stays labelled with its source.
 */
export function requireProductionLicense(source: PriorSource): SourceLicense {
    const license = SOURCE_LICENSES[source];
    if (!license.approvedForProduction) {
        throw new AppError(
            ErrorCode.FORBIDDEN,
            `Source ${source} is ${license.licenseStatus} and is not approved for production priors`,
        );
    }
    return license;
}
