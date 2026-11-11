import type { EvidenceChildSource, ICaseRepository, IGoogleSearchService, INHTSAService } from '@lemonade/core';
import { NhtsaRecallSource } from './NhtsaRecallSource';
import { TsbSource } from './TsbSource';
import { KnownFailureSource } from './KnownFailureSource';
import { SimilarCaseSource } from './SimilarCaseSource';

export interface EvidenceSourceDeps {
    nhtsa: INHTSAService;
    search: IGoogleSearchService;
    caseRepo: ICaseRepository;
}

/** The four LM-18 children in canonical launch order: recalls, TSBs, known failures, similar cases. */
export function createDefaultEvidenceSources(deps: EvidenceSourceDeps): EvidenceChildSource[] {
    return [
        new NhtsaRecallSource(deps.nhtsa),
        new TsbSource(deps.search),
        new KnownFailureSource(deps.search),
        new SimilarCaseSource(deps.caseRepo),
    ];
}
