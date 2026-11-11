import type { MemoryVersion, PlaybookEntry, WikiPage } from '../types/learnedMemory';
import type { MemoryScope, ShopSettings, TechProfile, VehicleRecord } from '../types/memory';

/** Tech profile store: one profile per tech, owned by the shop account. */
export interface ITechProfileStore {
    readTechProfile(shopId: string, techId: string): Promise<TechProfile | null>;
    writeTechProfile(profile: TechProfile): Promise<void>;
}

/** Vehicle record store: one record per shop + VIN. The shop holds the record. */
export interface IVehicleRecordStore {
    readVehicleRecord(shopId: string, vin: string): Promise<VehicleRecord | null>;
    writeVehicleRecord(record: VehicleRecord): Promise<void>;
}

/** Shop settings store: business settings set once by the owner on the web. */
export interface IShopSettingsStore {
    readShopSettings(shopId: string): Promise<ShopSettings | null>;
    writeShopSettings(settings: ShopSettings): Promise<void>;
}

/** Memory version store: every version is kept so the previous one can roll back. */
export interface IMemoryVersionStore {
    listVersions(scope: MemoryScope, key: string): Promise<MemoryVersion[]>;
    writeVersion(version: MemoryVersion): Promise<void>;
}

/** Playbook store: entries are never deleted, only moved stale or archived. */
export interface IPlaybookStore {
    readPlaybookEntries(shopId: string): Promise<PlaybookEntry[]>;
    writePlaybookEntry(entry: PlaybookEntry): Promise<void>;
}

/** Shop wiki store: one page per vehicle family, built only from confirmed repairs. */
export interface IWikiStore {
    readWikiPage(shopId: string, family: string): Promise<WikiPage | null>;
    writeWikiPage(page: WikiPage): Promise<void>;
}

/** Composite scope store for callers that need every scope. */
export interface IMemoryScopeStore
    extends
        ITechProfileStore,
        IVehicleRecordStore,
        IShopSettingsStore,
        IMemoryVersionStore,
        IPlaybookStore,
        IWikiStore {}
