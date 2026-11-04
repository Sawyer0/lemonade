/**
 * In-memory stand-in for the slice of the Firestore Admin API the repositories use:
 * collection/doc get, set (with merge), update, delete, add, where/orderBy queries
 * and the increment, arrayUnion and delete field transforms. Documents are stored
 * by full path, so `doc('users/u1/usage/stats')` and nested collections work.
 * Like Firestore, Dates are stored and read back as Timestamps.
 */
import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

interface FieldTransform {
    methodName: string;
    operand?: number;
    elements?: unknown[];
}

function asTransform(value: unknown): FieldTransform | null {
    if (value && typeof value === 'object' && 'methodName' in value) {
        const name = (value as { methodName: unknown }).methodName;
        if (typeof name === 'string' && name.startsWith('FieldValue.')) return value as FieldTransform;
    }
    return null;
}

/** Copies a written value the way Firestore stores it: Dates become Timestamps. */
function toStored(value: unknown): unknown {
    if (value instanceof Date) return Timestamp.fromDate(value);
    if (value instanceof Timestamp) return value;
    if (Array.isArray(value)) return value.map(toStored);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, toStored(v)]),
        );
    }
    return value;
}

function applyFields(target: Data, fields: Data): Data {
    const next: Data = { ...target };
    for (const [key, value] of Object.entries(fields)) {
        const transform = asTransform(value);
        if (!transform) {
            if (value !== undefined) next[key] = toStored(value);
        } else if (transform.methodName === 'FieldValue.delete') {
            delete next[key];
        } else if (transform.methodName === 'FieldValue.increment') {
            next[key] = (typeof next[key] === 'number' ? (next[key] as number) : 0) + (transform.operand ?? 0);
        } else if (transform.methodName === 'FieldValue.arrayUnion') {
            const current = Array.isArray(next[key]) ? (next[key] as unknown[]) : [];
            next[key] = [...current, ...(transform.elements ?? []).map(toStored)];
        } else {
            throw new Error(`fakeFirestore: unsupported transform ${transform.methodName}`);
        }
    }
    return next;
}

export class FakeDocumentSnapshot {
    constructor(
        readonly id: string,
        private readonly stored: Data | undefined,
    ) {}

    get exists(): boolean {
        return this.stored !== undefined;
    }

    data(): Data | undefined {
        return this.stored && { ...this.stored };
    }
}

export class FakeDocumentReference {
    constructor(
        private readonly store: Map<string, Data>,
        readonly path: string,
    ) {}

    get id(): string {
        return this.path.split('/').pop() ?? '';
    }

    collection(name: string): FakeCollectionReference {
        return new FakeCollectionReference(this.store, `${this.path}/${name}`);
    }

    async get(): Promise<FakeDocumentSnapshot> {
        return new FakeDocumentSnapshot(this.id, this.store.get(this.path));
    }

    async set(data: Data, options?: { merge?: boolean }): Promise<void> {
        const base = options?.merge ? (this.store.get(this.path) ?? {}) : {};
        this.store.set(this.path, applyFields(base, data));
    }

    async update(data: Data): Promise<void> {
        const current = this.store.get(this.path);
        if (!current) throw new Error(`5 NOT_FOUND: No document to update: ${this.path}`);
        this.store.set(this.path, applyFields(current, data));
    }

    async delete(): Promise<void> {
        this.store.delete(this.path);
    }
}

function sortKey(value: unknown): number | string {
    if (value instanceof Timestamp) return value.toMillis();
    return typeof value === 'number' || typeof value === 'string' ? value : String(value);
}

type Filter = { field: string; value: unknown };
type Order = { field: string; direction: 'asc' | 'desc' };

export class FakeQuery {
    constructor(
        protected readonly store: Map<string, Data>,
        readonly path: string,
        private readonly filters: Filter[] = [],
        private readonly order?: Order,
    ) {}

    where(field: string, op: string, value: unknown): FakeQuery {
        if (op !== '==') throw new Error(`fakeFirestore: unsupported operator ${op}`);
        return new FakeQuery(this.store, this.path, [...this.filters, { field, value }], this.order);
    }

    orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
        return new FakeQuery(this.store, this.path, this.filters, { field, direction });
    }

    async get(): Promise<{ docs: FakeDocumentSnapshot[]; empty: boolean }> {
        const prefix = `${this.path}/`;
        let docs = [...this.store.entries()]
            .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .filter(([, data]) => this.filters.every((f) => data[f.field] === f.value))
            .map(([path, data]) => new FakeDocumentSnapshot(path.slice(prefix.length), data));
        if (this.order) {
            const { field, direction } = this.order;
            const sign = direction === 'desc' ? -1 : 1;
            docs = docs.sort((a, b) => {
                const left = sortKey(a.data()?.[field]);
                const right = sortKey(b.data()?.[field]);
                return left < right ? -sign : left > right ? sign : 0;
            });
        }
        return { docs, empty: docs.length === 0 };
    }
}

export class FakeCollectionReference extends FakeQuery {
    doc(id: string): FakeDocumentReference {
        return new FakeDocumentReference(this.store, `${this.path}/${id}`);
    }

    async add(data: Data): Promise<FakeDocumentReference> {
        const ref = this.doc(randomUUID());
        await ref.set(data);
        return ref;
    }
}

export class FakeFirestore {
    readonly store = new Map<string, Data>();

    collection(name: string): FakeCollectionReference {
        return new FakeCollectionReference(this.store, name);
    }

    doc(path: string): FakeDocumentReference {
        return new FakeDocumentReference(this.store, path);
    }

    /** Documents directly under a collection path, keyed by id. */
    documents(collectionPath: string): Record<string, Data> {
        const prefix = `${collectionPath}/`;
        return Object.fromEntries(
            [...this.store.entries()]
                .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
                .map(([path, data]) => [path.slice(prefix.length), data]),
        );
    }

    clear(): void {
        this.store.clear();
    }
}
