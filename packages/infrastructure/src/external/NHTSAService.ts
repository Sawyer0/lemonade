import { injectable, inject } from 'inversify';
import type { ILogger, IVehicleInfoProvider, VehicleSpecs } from '@lemonade/core';
import { AppError, ErrorCode, INHTSAService, SafetyRecall, SafetyRecallSchema } from '@lemonade/core';
import { TYPES } from '../di/types';

/** Recalls API. NHTSA_API_BASE_URL overrides it, e.g. with a recorded fixture server in tests. */
export const NHTSA_RECALLS_BASE_URL = 'https://api.nhtsa.gov';
/** vPIC VIN decoder. It lives on its own host; api.nhtsa.gov answers 403 for these paths. */
export const NHTSA_VPIC_BASE_URL = 'https://vpic.nhtsa.dot.gov/api';

/** The DecodeVinValues fields this service reads; vPIC returns every field as a string. */
interface DecodedVin {
    ErrorCode?: string;
    Make?: string;
    Model?: string;
    ModelYear?: string;
    DisplacementL?: string;
    EngineConfiguration?: string;
    FuelTypePrimary?: string;
    Trim?: string;
}

function field(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

/** "2.998832712" -> "3.0". */
function roundDisplacement(litres: string): string {
    const value = Number(litres);
    return Number.isFinite(value) ? value.toFixed(1) : litres;
}

/** NHTSA public data: safety recalls by vehicle, and VIN validation and decoding through vPIC. */
@injectable()
export class NHTSAService implements INHTSAService, IVehicleInfoProvider {
    private readonly recallsBaseUrl = process.env.NHTSA_API_BASE_URL?.trim() || NHTSA_RECALLS_BASE_URL;
    private readonly vpicBaseUrl = process.env.NHTSA_VPIC_BASE_URL?.trim() || NHTSA_VPIC_BASE_URL;

    constructor(@inject(TYPES.Logger) private logger: ILogger) {}

    async checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]> {
        try {
            return await this.checkRecallsStrict(year, make, model);
        } catch (error) {
            this.logger.error('[NHTSAService] Failed to fetch recalls', error);
            return [];
        }
    }

    /**
     * Like checkRecalls, but a failure throws instead of returning an empty
     * list, so the caller can tell "no recalls" apart from "the lookup
     * failed" (LM-18: a failed lookup is 'recall status unknown', never 'no
     * recalls'). checkRecalls stays forgiving for its existing callers.
     */
    async checkRecallsStrict(year: number, make: string, model: string): Promise<SafetyRecall[]> {
        this.logger.info(`[NHTSAService] Checking recalls for ${year} ${make} ${model}`);

        const url = `${this.recallsBaseUrl}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
        const response = await fetch(url);

        if (!response.ok) {
            this.logger.error(`[NHTSAService] API Error: ${response.statusText}`, undefined);
            throw new Error(`NHTSA recalls lookup failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.Count > 0 && Array.isArray(data.results)) {
            this.logger.info(`[NHTSAService] Found ${data.Count} recalls`);
            return data.results.map((r: Record<string, unknown>) =>
                SafetyRecallSchema.parse({
                    ReportReceivedDate: String(r.ReportReceivedDate || ''),
                    Component: String(r.Component || ''),
                    Summary: String(r.Summary || ''),
                    Consequence: String(r.Consequence || ''),
                    Remedy: String(r.Remedy || ''),
                    Notes: String(r.Notes || ''),
                    NHTSACampaignNumber: String(r.NHTSACampaignNumber || ''),
                    Manufacturer: String(r.Manufacturer || ''),
                    parkIt: !!r.parkIt,
                    parkOutSide: !!r.parkOutSide,
                    overTheAirUpdate: !!r.overTheAirUpdate,
                    NHTSAActionNumber: String(r.NHTSAActionNumber || ''),
                    ModelYear: String(r.ModelYear || ''),
                    Make: String(r.Make || ''),
                    Model: String(r.Model || ''),
                }),
            );
        }

        return [];
    }

    async validateVin(vin: string): Promise<boolean> {
        try {
            return (await this.decodeVin(vin))?.ErrorCode === '0';
        } catch (error) {
            this.logger.error('[NHTSAService] VIN check failed', error);
            return false;
        }
    }

    /** Year, make, model, engine and trim for a VIN. Throws an AppError when vPIC cannot decode it. */
    async getVehicleSpecs(vin: string): Promise<VehicleSpecs> {
        let decoded: DecodedVin | null;
        try {
            decoded = await this.decodeVin(vin);
        } catch (error) {
            this.logger.error('[NHTSAService] VIN decode failed', error, { vin: vin.slice(-4) });
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Could not verify vehicle identity. Please try again.');
        }

        const make = field(decoded?.Make);
        const model = field(decoded?.Model);
        const year = Number(field(decoded?.ModelYear));
        if (!decoded || !make || !model || !Number.isInteger(year)) {
            throw new AppError(ErrorCode.INVALID_INPUT, 'This VIN could not be decoded. Check it and try again.');
        }

        const displacement = field(decoded.DisplacementL);
        const engine = displacement
            ? [
                  `${roundDisplacement(displacement)}L`,
                  field(decoded.EngineConfiguration),
                  field(decoded.FuelTypePrimary),
              ]
                  .filter(Boolean)
                  .join(' ')
            : 'Unknown Engine';

        return { year, make, model, engine, trim: field(decoded.Trim) };
    }

    /** One flat DecodeVinValues record, or null when vPIC returns none. Throws on HTTP failure. */
    private async decodeVin(vin: string): Promise<DecodedVin | null> {
        const url = `${this.vpicBaseUrl}/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`vPIC answered ${response.status}`);
        const data = (await response.json()) as { Results?: DecodedVin[] };
        return data.Results?.[0] ?? null;
    }
}
