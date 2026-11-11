import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import type { AnonymizedAggregate } from '../types/learnedMemory';
import { AnonymizedAggregateSchema } from '../types/learnedMemory';
import { isGlobalPriorsEnabled } from './scopes';

/**
 * Global priors (LM-31): later, behind a flag. Only anonymized aggregates
 * from shops that opt in. No VINs, no customer data — the schema is strict,
 * so a VIN or any customer field in the payload fails validation.
 */

export function validateAnonymizedAggregate(input: unknown): AnonymizedAggregate {
    const parsed = AnonymizedAggregateSchema.safeParse(input);
    if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid anonymized aggregate: ${parsed.error.message}`);
    }
    return parsed.data;
}

/** Submits an opted-in aggregate. Throws while the flag is off. */
export function submitGlobalAggregate(input: unknown): AnonymizedAggregate {
    if (!isGlobalPriorsEnabled()) {
        throw new AppError(ErrorCode.FORBIDDEN, 'Global priors are disabled.');
    }
    return validateAnonymizedAggregate(input);
}
