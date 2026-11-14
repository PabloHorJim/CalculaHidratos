import { MealHistoryEntry } from '../types';

/** Maximum number of meals kept (≈ 2 months at 3 meals/day). */
export const HISTORY_LIMIT = 200;
/** Saving the same recipe again within this window updates the entry instead of adding one. */
export const UPSERT_WINDOW_MS = 2 * 60 * 60 * 1000;

const time = (entry: MealHistoryEntry) => new Date(entry.timestamp).getTime() || 0;

/** Newest first, capped. Stable for entries with the same timestamp. */
export function sortHistory(list: MealHistoryEntry[]): MealHistoryEntry[] {
    return [...list].sort((a, b) => time(b) - time(a)).slice(0, HISTORY_LIMIT);
}

export interface HistoryUpdate {
    recipeName: string;
    totalCarbs: number;
    /** Omit netWeight/portions to keep the split already stored in a recent entry. */
    netWeight?: number;
    portions?: MealHistoryEntry['portions'];
    isBatch?: boolean;
}

/** Adds a meal, or updates the entry of the same recipe saved in the last two hours. */
export function upsertHistory(list: MealHistoryEntry[], update: HistoryUpdate, now = Date.now()): MealHistoryEntry[] {
    const existing = list.find(m => m.recipeName === update.recipeName && now - time(m) < UPSERT_WINDOW_MS && now - time(m) >= 0);
    const isBatch = update.isBatch ?? existing?.isBatch ?? false;
    const entry: MealHistoryEntry = {
        id: existing ? existing.id : now.toString(),
        timestamp: new Date(now).toISOString(),
        recipeName: update.recipeName,
        totalCarbs: update.totalCarbs,
        netWeight: update.netWeight ?? existing?.netWeight ?? 0,
        portions: isBatch ? [] : (update.portions ?? existing?.portions ?? []),
        ...(isBatch ? { isBatch: true } : {})
    };
    return sortHistory([entry, ...list.filter(m => m !== existing)]);
}

/** Local calendar day as YYYY-MM-DD (toISOString would shift late dinners to another day). */
export function localDateKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
