/**
 * Glucose readings from a continuous sensor, for patient mode.
 *   - Nightscout: asked directly from the browser (the user's own site).
 *   - LibreLinkUp: through /api/glucose, because Abbott's servers do not accept browser calls.
 * The connection details stay on this device (never in the family group, never synced).
 */

export type Trend = 'down2' | 'down' | 'flat' | 'up' | 'up2';
export interface Reading { time: number; mgdl: number; trend?: Trend }

export interface LibreSession { token: string; accountId: string; region: string; expires: number }

export interface GlucoseConfig {
    type: 'none' | 'nightscout' | 'librelinkup';
    nightscoutUrl?: string;
    nightscoutToken?: string;
    libre?: LibreSession;
}

export class GlucoseError extends Error {
    constructor(message: string, readonly needsReconnect = false) { super(message); }
}

export const TREND_ARROW: Record<Trend, string> = { down2: '↓', down: '↘', flat: '→', up: '↗', up2: '↑' };
export const TREND_TEXT: Record<Trend, string> = {
    down2: 'bajando rápido', down: 'bajando', flat: 'estable', up: 'subiendo', up2: 'subiendo rápido'
};

/** A reading older than this is shown but never offered for a dose calculation. */
export const FRESH_MS = 10 * 60 * 1000;

const NIGHTSCOUT_TRENDS: Record<string, Trend> = {
    DoubleDown: 'down2', TripleDown: 'down2', SingleDown: 'down2', FortyFiveDown: 'down',
    Flat: 'flat', FortyFiveUp: 'up', SingleUp: 'up2', DoubleUp: 'up2', TripleUp: 'up2'
};

/** "misitio.ejemplo.com/" -> "https://misitio.ejemplo.com"; null when it is not a usable address. */
export function normalizeNightscoutUrl(input: string): string | null {
    const text = input.trim();
    if (!text) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        if (url.protocol !== 'https:' && !local) return null; // health data: never over plain http
        return url.origin + url.pathname.replace(/\/+$/, '');
    } catch {
        return null;
    }
}

export function parseNightscout(body: unknown): Reading[] {
    if (!Array.isArray(body)) return [];
    const readings: Reading[] = [];
    for (const entry of body as { sgv?: number; date?: number; direction?: string }[]) {
        const mgdl = Number(entry?.sgv);
        const time = Number(entry?.date);
        if (!Number.isFinite(mgdl) || !Number.isFinite(time) || mgdl < 20 || mgdl > 600) continue;
        const trend = entry.direction ? NIGHTSCOUT_TRENDS[entry.direction] : undefined;
        readings.push({ time, mgdl, ...(trend ? { trend } : {}) });
    }
    return readings.sort((a, b) => a.time - b.time);
}

export async function fetchNightscout(config: GlucoseConfig, fetchImpl: typeof fetch = fetch): Promise<Reading[]> {
    const base = normalizeNightscoutUrl(config.nightscoutUrl ?? '');
    if (!base) throw new GlucoseError('La dirección de Nightscout no es válida (debe empezar por https://)');
    const token = config.nightscoutToken?.trim();
    // 6 hours at one reading every 5 minutes
    const response = await fetchImpl(`${base}/api/v1/entries/sgv.json?count=72${token ? `&token=${encodeURIComponent(token)}` : ''}`, {
        headers: { Accept: 'application/json' }
    });
    if (response.status === 401 || response.status === 403) throw new GlucoseError('Nightscout rechazó el acceso: revisa el token');
    if (!response.ok) throw new GlucoseError(`Nightscout respondió ${response.status}`);
    return parseNightscout(await response.json());
}

async function bridge<T>(idToken: string, payload: Record<string, unknown>, fetchImpl: typeof fetch): Promise<T> {
    const response = await fetchImpl('/api/glucose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !body) throw new GlucoseError(body?.error || `El servidor respondió ${response.status}`, response.status === 401);
    return body;
}

export function connectLibre(idToken: string, email: string, password: string, fetchImpl: typeof fetch = fetch): Promise<LibreSession> {
    return bridge<LibreSession>(idToken, { action: 'login', email, password }, fetchImpl);
}

export async function fetchLibre(config: GlucoseConfig, idToken: string, fetchImpl: typeof fetch = fetch): Promise<Reading[]> {
    const session = config.libre;
    if (!session || session.expires < Date.now()) throw new GlucoseError('La sesión de LibreLinkUp ha caducado: vuelve a conectarla', true);
    const { readings } = await bridge<{ readings: Reading[] }>(idToken, { action: 'read', ...session }, fetchImpl);
    return Array.isArray(readings) ? readings : [];
}

/** Newest reading, and whether it is recent enough to be used for a dose. */
export function latestReading(readings: Reading[], now = Date.now()): { reading: Reading; ageMinutes: number; fresh: boolean } | null {
    const reading = readings[readings.length - 1];
    if (!reading) return null;
    const age = now - reading.time;
    return { reading, ageMinutes: Math.max(0, Math.round(age / 60000)), fresh: age >= -60000 && age <= FRESH_MS };
}
