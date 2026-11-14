import { canon, merge3, toPlain } from './merge';
import type { SyncStatus } from './engine';

export interface CollectionSnapshot<R> {
    docs: R[];
    /** True when the data comes from the offline cache instead of the server. */
    fromCache: boolean;
}

/** The little the engine needs from Firestore (faked in tests). */
export interface CollectionTransport<R> {
    subscribe(path: string, onSnapshot: (snapshot: CollectionSnapshot<R>) => void, onError: (error: unknown) => void): () => void;
    /** Writes each record as its own document and deletes the given ids. */
    commit(path: string, sets: R[], deletes: string[]): Promise<void>;
}

export interface CollectionBaseStore<R> {
    load(path: string): R[] | null;
    save(path: string, records: R[]): void;
}

export interface CollectionSyncOptions<R extends { id: string }> {
    path: string;
    transport: CollectionTransport<R>;
    baseStore: CollectionBaseStore<R>;
    initialLocal: R[];
    /** Called with the full list that must replace local state. */
    apply: (records: R[]) => void;
    onStatus?: (status: SyncStatus) => void;
    onError?: (error: unknown) => void;
    /** Applied after every merge (sorting). Must not drop records. */
    normalize?: (records: R[]) => R[];
    /**
     * One-off migration: while this returns a list, the first live snapshot is united with
     * it and with the local records instead of replacing them. `onSeeded` is called once
     * everything has been uploaded, so the caller can record that the migration is done.
     */
    seed?: () => R[] | null;
    onSeeded?: () => void;
    debounceMs?: number;
}

/**
 * Syncs a list of records where every record is its own remote document
 * (the meal history). Same principles as SyncEngine: nothing is written before the server
 * copy is known, remote changes are merged record by record, and offline changes wait
 * locally until the connection returns.
 *
 * The remote side may be a window (e.g. the newest 300 meals): a record that falls out of
 * the window disappears locally but is never deleted on the server.
 */
export class CollectionSyncEngine<R extends { id: string }> {
    private local: R[];
    private base: R[] | null;
    private live = false;
    private hydrated = false;
    private pushing = false;
    private pushAgain = false;
    private stopped = false;
    private seeding = false;
    /** Ids being uploaded right now: until the upload ends, local state decides for them. */
    private inFlight = new Set<string>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private unsubscribe: (() => void) | null = null;
    private readonly debounceMs: number;

    constructor(private readonly options: CollectionSyncOptions<R>) {
        this.local = options.initialLocal;
        this.base = options.baseStore.load(options.path);
        this.debounceMs = options.debounceMs ?? 800;
    }

    start() {
        this.setStatus('connecting');
        this.unsubscribe = this.options.transport.subscribe(
            this.options.path,
            snapshot => this.handleSnapshot(snapshot),
            error => {
                console.error('History sync listener failed', (error as any)?.code || error);
                this.setStatus('error');
                this.options.onError?.(error);
            }
        );
    }

    stop() {
        this.stopped = true;
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    setLocal(local: R[]) {
        this.local = local;
    }

    notifyLocalChange() {
        if (this.stopped || !this.hydrated || !this.isDirty()) return;
        if (this.live) {
            this.setStatus('saving');
            this.schedulePush();
        } else {
            this.setStatus('offline');
        }
    }

    flush() {
        if (this.timer) this.schedulePush(0);
    }

    // ---- internals ----

    private setStatus(status: SyncStatus) {
        if (!this.stopped) this.options.onStatus?.(status);
    }

    private normalize(records: R[]) {
        return this.options.normalize ? this.options.normalize(records) : records;
    }

    private diff() {
        const baseMap = new Map((this.base ?? []).map(r => [r.id, r]));
        const localIds = new Set(this.local.map(r => r.id));
        const sets = this.local.filter(r => !baseMap.has(r.id) || canon(r) !== canon(baseMap.get(r.id)));
        const deletes = [...baseMap.keys()].filter(id => !localIds.has(id));
        return { sets, deletes };
    }

    private isDirty() {
        const { sets, deletes } = this.diff();
        return sets.length > 0 || deletes.length > 0;
    }

    private saveBase(records: R[]) {
        this.base = records;
        this.options.baseStore.save(this.options.path, records);
    }

    private handleSnapshot(snapshot: CollectionSnapshot<R>) {
        if (this.stopped) return;
        this.live = !snapshot.fromCache;
        const remote = snapshot.docs;
        const seed = this.options.seed?.() ?? null;

        // Without a server answer we only trust the cache if this device has synced before
        if (snapshot.fromCache && (this.base === null || seed !== null)) {
            this.setStatus('offline');
            return;
        }

        let merged: R[];
        if (seed !== null) {
            // Migration: keep everything, the server copy of a record wins over the others
            const byId = new Map<string, R>();
            for (const r of [...remote, ...this.local, ...seed]) if (!byId.has(r.id)) byId.set(r.id, r);
            merged = [...byId.values()];
            this.seeding = true;
        } else if (this.base === null) {
            merged = remote; // first sync on this device: the cloud wins
        } else {
            merged = merge3(this.base, this.local, remote, 'id');
            if (this.inFlight.size > 0) {
                // A snapshot taken while our own upload is on its way may or may not include
                // it yet; for those records what the user sees locally is the truth.
                const localMap = new Map(this.local.map(r => [r.id, r]));
                merged = merged.filter(r => !this.inFlight.has(r.id));
                for (const id of this.inFlight) {
                    const l = localMap.get(id);
                    if (l) merged.push(l);
                }
            }
        }
        merged = this.normalize(merged);

        this.saveBase(toPlain(remote));
        this.hydrated = true;
        if (canon(merged) !== canon(this.local)) {
            this.local = merged;
            this.options.apply(merged);
        }

        if (!this.live) this.setStatus('offline');
        else if (this.isDirty()) { this.setStatus('saving'); this.schedulePush(); }
        else { this.finishSeeding(); this.setStatus('synced'); }
    }

    private finishSeeding() {
        if (!this.seeding) return;
        this.seeding = false;
        this.options.onSeeded?.();
    }

    private schedulePush(delay = this.debounceMs) {
        if (this.stopped) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = null; void this.push(); }, delay);
    }

    private async push() {
        if (this.stopped || !this.hydrated || !this.live) return;
        if (this.pushing) { this.pushAgain = true; return; }
        const { sets, deletes } = this.diff();
        if (sets.length === 0 && deletes.length === 0) { this.finishSeeding(); this.setStatus('synced'); return; }

        this.pushing = true;
        this.setStatus('saving');
        let failed = false;
        try {
            const sent = toPlain(sets);
            this.inFlight = new Set([...sent.map(r => r.id), ...deletes]);
            await this.options.transport.commit(this.options.path, sent, deletes);
            if (!this.stopped) {
                // Record what the server now has (a snapshot may already have done it)
                const next = new Map((this.base ?? []).map(r => [r.id, r]));
                for (const r of sent) next.set(r.id, r);
                for (const id of deletes) next.delete(id);
                this.saveBase([...next.values()]);
            }
            if (this.isDirty()) this.setStatus('saving');
            else { this.finishSeeding(); this.setStatus('synced'); }
        } catch (err: any) {
            failed = true;
            console.error('History sync failed', err?.code || err);
            const offline = err?.code === 'unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false);
            this.setStatus(offline ? 'offline' : 'error');
            if (!offline) this.options.onError?.(err);
        } finally {
            this.inFlight = new Set();
            this.pushing = false;
            if (this.pushAgain) {
                this.pushAgain = false;
                this.schedulePush(0);
            } else if (!failed && !this.timer && this.live && this.isDirty()) {
                this.schedulePush();
            }
        }
    }
}
