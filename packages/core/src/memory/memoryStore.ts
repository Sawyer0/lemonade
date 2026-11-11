import type { IMemoryScopeStore } from '../interfaces/IMemoryScopeStore';
import type { MemoryVersion, PlaybookEntry, WikiPage } from '../types/learnedMemory';
import type { MemoryScope, ShopSettings, TechProfile, VehicleRecord } from '../types/memory';
import { techProfileKey, vehicleRecordKey } from './scopes';

/**
 * In-memory scope store: the reference implementation used by tests and by
 * callers that have not wired a durable store yet. The durable vehicle
 * record store is Firestore, behind the same port.
 */
export class InMemoryMemoryScopeStore implements IMemoryScopeStore {
    private readonly techProfiles = new Map<string, TechProfile>();
    private readonly vehicleRecords = new Map<string, VehicleRecord>();
    private readonly shopSettings = new Map<string, ShopSettings>();
    private readonly versions = new Map<string, MemoryVersion[]>();
    private readonly playbookEntries = new Map<string, PlaybookEntry>();
    private readonly wikiPages = new Map<string, WikiPage>();

    async readTechProfile(shopId: string, techId: string): Promise<TechProfile | null> {
        return this.techProfiles.get(techProfileKey(shopId, techId)) ?? null;
    }

    async writeTechProfile(profile: TechProfile): Promise<void> {
        this.techProfiles.set(techProfileKey(profile.shopId, profile.techId), profile);
    }

    async readVehicleRecord(shopId: string, vin: string): Promise<VehicleRecord | null> {
        return this.vehicleRecords.get(vehicleRecordKey(shopId, vin)) ?? null;
    }

    async writeVehicleRecord(record: VehicleRecord): Promise<void> {
        this.vehicleRecords.set(vehicleRecordKey(record.shopId, record.vin), record);
    }

    async readShopSettings(shopId: string): Promise<ShopSettings | null> {
        return this.shopSettings.get(shopId) ?? null;
    }

    async writeShopSettings(settings: ShopSettings): Promise<void> {
        this.shopSettings.set(settings.shopId, settings);
    }

    async listVersions(scope: MemoryScope, key: string): Promise<MemoryVersion[]> {
        return [...(this.versions.get(`${scope}/${key}`) ?? [])];
    }

    async writeVersion(version: MemoryVersion): Promise<void> {
        const key = `${version.scope}/${version.key}`;
        const existing = this.versions.get(key) ?? [];
        this.versions.set(key, [...existing, version]);
    }

    async readPlaybookEntries(shopId: string): Promise<PlaybookEntry[]> {
        return [...this.playbookEntries.values()].filter((entry) => entry.shopId === shopId);
    }

    async writePlaybookEntry(entry: PlaybookEntry): Promise<void> {
        this.playbookEntries.set(entry.entryId, entry);
    }

    async readWikiPage(shopId: string, family: string): Promise<WikiPage | null> {
        return this.wikiPages.get(`${shopId}/${family}`) ?? null;
    }

    async writeWikiPage(page: WikiPage): Promise<void> {
        this.wikiPages.set(`${page.shopId}/${page.family}`, page);
    }
}
