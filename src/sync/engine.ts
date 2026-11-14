import { canon, merge3, toPlain } from './merge';

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'saving' | 'offline' | 'error';

export interface SyncField {
    /** For arrays of records: the property that identifies each record. */
    key?: string;
    /** Applied after every merge (e.g. to sort and cap the history). */
    normalize?: (value: any) => any;
}

export interface RemoteSnapshot {
    exists: boolean;
    data: Record<string, unknown>;
    /** True when the data comes from the offline cache instead of the server. */
    fromCache: boolean;
}

/** The little the engine needs from Firestore (faked in tests). */
export interface SyncTransport {
    subscribe(path: string, onSnapshot: (snapshot: RemoteSnapshot) => void, onError: (error: unknown) => void): () => void;
    /**
     * Atomically reads the document and writes the fields returned by `update`
     * (merged into the document). `update` may run more than once and returns
     * null when there is nothing to write.
     */
    transact(
        path: string,
        update: (server: { exists: boolean; data: Record<string, unknown> }) => Record<string, unknown> | null
    ): Promise<void>;
}

/** Where the last known server copy is kept between sessions. */
export interface BaseStore {
    load(path: string): Record<string, unknown> | null;
    save(path: string, data: Record<string, unknown>): void;
}

export interface SyncEngineOptions<T extends Record<string, unknown>> {
    path: string;
    fields: { [K in keyof T]: SyncField };
    transport: SyncTransport;
    baseStore: BaseStore;
    initialLocal: T;
    /** Called with the fields that must be replaced in local state. */
    apply: (patch: Partial<T>) => void;
    onStatus?: (status: SyncStatus) => void;
    /** Called with the raw document on every snapshot (null when it does not exist). */
    onRemoteDocument?: (path: string, data: Record<string, unknown> | null) => void;
    /** Extra fields added to every write (e.g. the owner uid required by the security rules). */
    extraOnWrite?: () => Record<string, unknown> | undefined;
    /** When false, a missing document is never created (group documents). */
    createIfMissing: boolean;
    debounceMs?: number;
}

/**
 * Keeps a set of local fields in sync with one remote document.
 *
 * - Nothing is written until the server copy has been received, so opening the app on a
 *   device with old data can never overwrite newer data in the cloud.
 * - Remote changes are merged into local state field by field (and record by record)
 *   instead of replacing everything.
 * - Local changes are pushed inside a transaction that re-reads the server copy and merges
 *   again; only the fields that actually changed are written.
 * - While offline nothing is queued: changes stay in local state (persisted by the app)
 *   next to the last known server copy ("base"), and are merged when the connection returns.
 */
export class SyncEngine<T extends Record<string, unknown>> {
    private local: T;
    private base: Record<string, unknown> | null;
    private live = false;      // connected and up to date with the server
    private hydrated = false;  // at least one usable snapshot received
    private exists = false;
    private pushing = false;
    private pushAgain = false;
    private stopped = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private unsubscribe: (() => void) | null = null;
    private readonly names: (keyof T & string)[];
    private readonly debounceMs: number;

    constructor(private readonly options: SyncEngineOptions<T>) {
        this.local = options.initialLocal;
        this.base = options.baseStore.load(options.path);
        this.names = Object.keys(options.fields) as (keyof T & string)[];
        this.debounceMs = options.debounceMs ?? 800;
    }

    start() {
        this.setStatus('connecting');
        this.unsubscribe = this.options.transport.subscribe(
            this.options.path,
            snapshot => this.handleSnapshot(snapshot),
            error => {
                console.error('Cloud sync listener failed', (error as any)?.code || error);
                this.setStatus('error');
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

    /** Tell the engine the current local values (cheap; call it on every change). */
    setLocal(local: T) {
        this.local = local;
    }

    /** Call after local values changed to schedule an upload. */
    notifyLocalChange() {
        if (this.stopped || !this.hydrated || !this.isDirty()) return;
        if (this.live) {
            this.setStatus('saving');
            this.schedulePush();
        } else {
            this.setStatus('offline');
        }
    }

    /** Upload pending changes now instead of waiting for the debounce. */
    flush() {
        if (this.timer) this.schedulePush(0);
    }

    get hasPendingChanges() {
        return this.hydrated && this.isDirty();
    }

    // ---- internals ----

    private setStatus(status: SyncStatus) {
        if (!this.stopped) this.options.onStatus?.(status);
    }

    private normalize(field: string, value: unknown) {
        const fn = this.options.fields[field]?.normalize;
        return fn ? fn(value) : value;
    }

    private isDirty() {
        const base = this.base ?? {};
        return this.names.some(f => canon(this.local[f]) !== canon(base[f]));
    }

    private applyPatch(patch: Partial<T>) {
        if (Object.keys(patch).length === 0) return;
        // Updated right away so the engine never works with values about to be replaced
        this.local = { ...this.local, ...patch };
        this.options.apply(patch);
    }

    private saveBase(data: Record<string, unknown>) {
        this.base = data;
        this.options.baseStore.save(this.options.path, data);
    }

    private handleSnapshot(snapshot: RemoteSnapshot) {
        if (this.stopped) return;
        this.live = !snapshot.fromCache;
        // A cached "does not exist" only means this device has never seen the document
        if (snapshot.fromCache && !snapshot.exists) {
            this.setStatus('offline');
            return;
        }
        this.exists = snapshot.exists;
        this.hydrated = true;

        const remote = snapshot.exists ? snapshot.data : {};
        this.options.onRemoteDocument?.(this.options.path, snapshot.exists ? remote : null);

        const base = this.base ?? {};
        const nextBase: Record<string, unknown> = {};
        const patch: Partial<T> = {};
        for (const f of this.names) {
            const r = remote[f];
            if (r === undefined) continue; // server has nothing: keep local, upload it later
            const l = this.local[f];
            const merged = this.normalize(
                f,
                base[f] === undefined
                    ? r // first sync of this field on this device: the cloud wins
                    : merge3(base[f], l, r, this.options.fields[f].key)
            );
            nextBase[f] = toPlain(r);
            if (canon(merged) !== canon(l)) (patch as any)[f] = merged;
        }
        this.saveBase(nextBase);
        this.applyPatch(patch);

        if (!this.live) this.setStatus('offline');
        else if (!this.exists && !this.options.createIfMissing) this.setStatus('error');
        else if (this.isDirty()) { this.setStatus('saving'); this.schedulePush(); }
        else this.setStatus('synced');
    }

    private schedulePush(delay = this.debounceMs) {
        if (this.stopped) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = null; void this.push(); }, delay);
    }

    private async push() {
        if (this.stopped || !this.hydrated || !this.live) return;
        if (!this.exists && !this.options.createIfMissing) return;
        if (this.pushing) { this.pushAgain = true; return; }
        if (!this.isDirty()) { this.setStatus('synced'); return; }

        this.pushing = true;
        this.setStatus('saving');
        // Local values the transaction was computed from. Read inside the transaction together
        // with `base`: a snapshot may update both while we wait for the network, and merging
        // an old local copy against a newer base would undo what that snapshot brought in.
        let usedLocal = this.local;
        let merged: Record<string, unknown> | null = null;
        let failed = false;
        try {
            await this.options.transport.transact(this.options.path, server => {
                merged = null;
                if (!server.exists && !this.options.createIfMissing) return null;
                const data = server.exists ? server.data : {};
                const base = this.base ?? {};
                usedLocal = this.local;
                const toWrite: Record<string, unknown> = {};
                const result: Record<string, unknown> = {};
                for (const f of this.names) {
                    const l = usedLocal[f];
                    const s = data[f];
                    let m: unknown;
                    if (s === undefined) m = l;               // server has nothing yet
                    else if (base[f] === undefined) m = s;    // never synced: server wins
                    else m = merge3(base[f], l, s, this.options.fields[f].key);
                    m = this.normalize(f, m);
                    result[f] = m;
                    if (canon(m) !== canon(s)) toWrite[f] = toPlain(m);
                }
                merged = result;
                if (Object.keys(toWrite).length === 0) return null;
                return { ...toWrite, ...(this.options.extraOnWrite?.() ?? {}), updatedAt: new Date().toISOString() };
            });

            if (merged && !this.stopped) {
                const outcome: Record<string, unknown> = merged;
                const nextBase: Record<string, unknown> = { ...(this.base ?? {}) };
                const patch: Partial<T> = {};
                for (const f of this.names) {
                    // If the user kept editing this field while the transaction was running,
                    // leave it alone: the next round merges it against the old base.
                    if (canon(this.local[f]) !== canon(usedLocal[f])) continue;
                    nextBase[f] = toPlain(outcome[f]);
                    if (canon(outcome[f]) !== canon(this.local[f])) (patch as any)[f] = outcome[f];
                }
                this.exists = true;
                this.saveBase(nextBase);
                this.applyPatch(patch);
            }
            this.setStatus(this.isDirty() ? 'saving' : 'synced');
        } catch (err: any) {
            failed = true;
            console.error('Cloud sync failed', err?.code || err);
            const offline = err?.code === 'unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false);
            this.setStatus(offline ? 'offline' : 'error');
        } finally {
            this.pushing = false;
            if (this.pushAgain) {
                this.pushAgain = false;
                this.schedulePush(0);
            } else if (!failed && !this.timer && this.live && this.isDirty()) {
                this.schedulePush();
            }
            // After a failure, the next local change or the next live snapshot retries.
        }
    }
}
