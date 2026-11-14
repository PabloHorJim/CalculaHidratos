import { useEffect, useRef, useState } from 'react';
import { db, doc, onSnapshot, runTransaction } from '../firebase';
import { SyncEngine, SyncField, SyncStatus, SyncTransport, BaseStore } from '../sync/engine';

export type { SyncField, SyncStatus };

interface Options<T extends Record<string, unknown>> {
    /** Firestore document to sync with, e.g. "groups/ABC123". `null` disables sync. */
    docPath: string | null;
    /** Current local value of every synced field (memoised: a new object means "changed"). */
    local: T;
    fields: { [K in keyof T]: SyncField };
    apply: (patch: Partial<T>) => void;
    onRemoteDocument?: (path: string, data: Record<string, unknown> | null, fromCache: boolean) => void;
    extraOnWrite?: Record<string, unknown>;
    createIfMissing: boolean;
    /** localStorage key for the last known server copy (one per synced document kind). */
    storageKey?: string;
    /** Called when the listener is rejected (e.g. "permission-denied" after leaving a group). */
    onError?: (code: string, path: string) => void;
}

export const SHARED_BASE_KEY = 'carb_calc_sync_base';

/** Last known server copy, kept in localStorage so offline edits survive an app restart. */
function localStorageBaseStore(storageKey: string): BaseStore {
    return {
        load(path) {
            try {
                const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
                return parsed && parsed.path === path && parsed.data ? parsed.data : null;
            } catch {
                return null;
            }
        },
        save(path, data) {
            try {
                localStorage.setItem(storageKey, JSON.stringify({ path, data }));
            } catch (e) {
                console.error('Could not persist sync base', e);
            }
        }
    };
}

export function clearSyncBase(...storageKeys: string[]) {
    for (const key of storageKeys) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
}

const firestoreTransport: SyncTransport = {
    subscribe(path, onSnap, onError) {
        return onSnapshot(doc(db, path), { includeMetadataChanges: true }, snapshot => {
            onSnap({
                exists: snapshot.exists(),
                data: (snapshot.data() ?? {}) as Record<string, unknown>,
                fromCache: snapshot.metadata.fromCache
            });
        }, onError);
    },
    async transact(path, update) {
        const ref = doc(db, path);
        await runTransaction(db, async tx => {
            const snap = await tx.get(ref);
            const fields = update({ exists: snap.exists(), data: (snap.data() ?? {}) as Record<string, unknown> });
            if (fields) tx.set(ref, fields, { merge: true });
        });
    }
};

/** React wrapper around SyncEngine: one engine per synced document. */
export function useCloudSync<T extends Record<string, unknown>>(options: Options<T>) {
    const { docPath } = options;
    const [status, setStatus] = useState<SyncStatus>(docPath ? 'connecting' : 'off');
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const engineRef = useRef<SyncEngine<T> | null>(null);

    // Keep the engine's view of local state current during render, so a snapshot arriving
    // between render and effects is never merged against stale values.
    const lastLocal = useRef<T | null>(null);
    if (lastLocal.current !== options.local) {
        lastLocal.current = options.local;
        engineRef.current?.setLocal(options.local);
    }

    useEffect(() => {
        if (!docPath) {
            setStatus('off');
            return;
        }
        const engine = new SyncEngine<T>({
            path: docPath,
            fields: optionsRef.current.fields,
            transport: firestoreTransport,
            baseStore: localStorageBaseStore(optionsRef.current.storageKey ?? SHARED_BASE_KEY),
            initialLocal: optionsRef.current.local,
            apply: patch => optionsRef.current.apply(patch),
            onStatus: setStatus,
            onError: error => optionsRef.current.onError?.(String((error as any)?.code ?? 'unknown'), docPath),
            onRemoteDocument: (path, data, fromCache) => optionsRef.current.onRemoteDocument?.(path, data, fromCache),
            extraOnWrite: () => optionsRef.current.extraOnWrite,
            createIfMissing: optionsRef.current.createIfMissing
        });
        engineRef.current = engine;
        engine.start();

        // Upload pending changes right away when the app goes to the background
        const flush = () => { if (document.visibilityState === 'hidden') engine.flush(); };
        document.addEventListener('visibilitychange', flush);

        return () => {
            document.removeEventListener('visibilitychange', flush);
            engine.stop();
            if (engineRef.current === engine) engineRef.current = null;
        };
    }, [docPath]);

    useEffect(() => {
        engineRef.current?.setLocal(options.local);
        engineRef.current?.notifyLocalChange();
    }, [options.local, docPath]);

    return { status };
}
