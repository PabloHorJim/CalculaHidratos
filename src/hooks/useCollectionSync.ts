import { useEffect, useRef, useState } from 'react';
import { db, collection, doc, onSnapshot, query, orderBy, limit, writeBatch } from '../firebase';
import { CollectionSyncEngine, CollectionTransport, CollectionBaseStore } from '../sync/collectionEngine';
import type { SyncStatus } from '../sync/engine';

interface Options<R extends { id: string }> {
    /** Firestore collection, e.g. "groups/ABC123/meals". `null` disables sync. */
    collectionPath: string | null;
    local: R[];
    apply: (records: R[]) => void;
    normalize?: (records: R[]) => R[];
    /** Field used to order the remote window (newest first). */
    orderField: string;
    /** How many of the newest records are kept in sync on the device. */
    windowSize: number;
    storageKey: string;
    /** Pending one-off migration (see CollectionSyncEngine). */
    seed?: R[] | null;
    onSeeded?: () => void;
    onError?: (code: string, path: string) => void;
}

function localStorageStore<R>(storageKey: string): CollectionBaseStore<R> {
    return {
        load(path) {
            try {
                const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
                return parsed && parsed.path === path && Array.isArray(parsed.records) ? parsed.records : null;
            } catch {
                return null;
            }
        },
        save(path, records) {
            try {
                localStorage.setItem(storageKey, JSON.stringify({ path, records }));
            } catch (e) {
                console.error('Could not persist history sync base', e);
            }
        }
    };
}

const BATCH_SIZE = 400; // Firestore allows 500 operations per batch

function firestoreTransport<R extends { id: string }>(orderField: string, windowSize: number): CollectionTransport<R> {
    return {
        subscribe(path, onSnap, onError) {
            const q = query(collection(db, path), orderBy(orderField, 'desc'), limit(windowSize));
            return onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
                onSnap({
                    docs: snapshot.docs.map(d => ({ ...(d.data() as R), id: d.id })),
                    fromCache: snapshot.metadata.fromCache
                });
            }, onError);
        },
        async commit(path, sets, deletes) {
            const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [
                ...sets.map(record => (batch: ReturnType<typeof writeBatch>) => batch.set(doc(db, path, record.id), record)),
                ...deletes.map(id => (batch: ReturnType<typeof writeBatch>) => batch.delete(doc(db, path, id)))
            ];
            for (let i = 0; i < ops.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                ops.slice(i, i + BATCH_SIZE).forEach(op => op(batch));
                await batch.commit();
            }
        }
    };
}

/** React wrapper around CollectionSyncEngine: one engine per synced collection. */
export function useCollectionSync<R extends { id: string }>(options: Options<R>) {
    const { collectionPath } = options;
    const [status, setStatus] = useState<SyncStatus>(collectionPath ? 'connecting' : 'off');
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const engineRef = useRef<CollectionSyncEngine<R> | null>(null);

    const lastLocal = useRef<R[] | null>(null);
    if (lastLocal.current !== options.local) {
        lastLocal.current = options.local;
        engineRef.current?.setLocal(options.local);
    }

    useEffect(() => {
        if (!collectionPath) {
            setStatus('off');
            return;
        }
        const engine = new CollectionSyncEngine<R>({
            path: collectionPath,
            transport: firestoreTransport<R>(optionsRef.current.orderField, optionsRef.current.windowSize),
            baseStore: localStorageStore<R>(optionsRef.current.storageKey),
            initialLocal: optionsRef.current.local,
            apply: records => optionsRef.current.apply(records),
            onStatus: setStatus,
            onError: error => optionsRef.current.onError?.(String((error as any)?.code ?? 'unknown'), collectionPath),
            normalize: records => optionsRef.current.normalize?.(records) ?? records,
            seed: () => optionsRef.current.seed ?? null,
            onSeeded: () => optionsRef.current.onSeeded?.()
        });
        engineRef.current = engine;
        engine.start();

        const flush = () => { if (document.visibilityState === 'hidden') engine.flush(); };
        document.addEventListener('visibilitychange', flush);
        return () => {
            document.removeEventListener('visibilitychange', flush);
            engine.stop();
            if (engineRef.current === engine) engineRef.current = null;
        };
    }, [collectionPath]);

    useEffect(() => {
        engineRef.current?.setLocal(options.local);
        engineRef.current?.notifyLocalChange();
    }, [options.local, collectionPath]);

    return { status };
}
