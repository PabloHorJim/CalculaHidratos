/**
 * Pure helpers for the cloud sync engine (see hooks/useCloudSync.ts).
 *
 * The app keeps every shared collection (recipes, family, history…) as a field of a
 * single Firestore document. To stop devices from overwriting each other, every field
 * is reconciled with a three-way merge between:
 *   - base:   the last value this device knows the server had,
 *   - local:  the value currently in the app,
 *   - remote: the value the server has now.
 */

/** Canonical JSON: sorted object keys, `undefined` dropped. Used for deep equality. */
export function canon(value: unknown): string {
    return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(v => (v === undefined ? null : sortKeys(v)));
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as object).sort()) {
            const v = (value as Record<string, unknown>)[key];
            if (v !== undefined) out[key] = sortKeys(v);
        }
        return out;
    }
    return value;
}

/** Firestore rejects `undefined` anywhere in a document; a JSON round trip removes it. */
export function toPlain<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Three-way merge of one field.
 * @param key  for arrays of records, the property that identifies a record ("id").
 */
export function merge3<T>(base: T | undefined, local: T, remote: T, key?: string): T {
    const l = canon(local);
    const r = canon(remote);
    if (l === r) return local;
    const b = canon(base);
    if (b === r) return local;   // only this device changed it
    if (b === l) return remote;  // only someone else changed it

    // Both sides changed: merge record by record when we can, otherwise local wins.
    if (key && Array.isArray(local) && Array.isArray(remote)) {
        return mergeRecords(Array.isArray(base) ? base : [], local, remote, key) as unknown as T;
    }
    if (isPlainObject(local) && isPlainObject(remote)) {
        return mergeMaps(isPlainObject(base) ? base : {}, local, remote) as unknown as T;
    }
    return local;
}

function mergeRecords(base: any[], local: any[], remote: any[], key: string): any[] {
    const index = (list: any[]) => new Map(list.map(item => [String(item?.[key]), item]));
    const baseMap = index(base);
    const localMap = index(local);
    const remoteMap = index(remote);
    const result: any[] = [];
    const seen = new Set<string>();

    for (const r of remote) {
        const k = String(r?.[key]);
        if (seen.has(k)) continue;
        seen.add(k);
        const l = localMap.get(k);
        const b = baseMap.get(k);
        if (l === undefined) {
            if (b === undefined) result.push(r); // added remotely
            // else: deleted locally → stays deleted
        } else {
            const localChanged = b === undefined || canon(l) !== canon(b);
            result.push(localChanged ? l : r);
        }
    }
    for (const l of local) {
        const k = String(l?.[key]);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!baseMap.has(k)) result.push(l); // added locally
        // else: deleted remotely → stays deleted
    }
    return result;
}

function mergeMaps(
    base: Record<string, unknown>,
    local: Record<string, unknown>,
    remote: Record<string, unknown>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
        const inLocal = k in local;
        const inRemote = k in remote;
        const inBase = k in base;
        if (inLocal && inRemote) {
            const localChanged = !inBase || canon(local[k]) !== canon(base[k]);
            result[k] = localChanged ? local[k] : remote[k];
        } else if (inLocal) {
            if (!inBase) result[k] = local[k];
        } else if (!inBase) {
            result[k] = remote[k];
        }
    }
    return result;
}
