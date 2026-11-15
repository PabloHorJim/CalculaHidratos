import { createHash } from 'node:crypto';

/**
 * LibreLinkUp client (the "follower" service of FreeStyle Libre sensors).
 *
 * There is no official public API: this talks to the same endpoints as the LibreLinkUp
 * phone app, as documented by the open-source community (nightscout-librelink-up and
 * others). Abbott may change them without notice; LIBRE_LLU_VERSION overrides the app
 * version sent when they start rejecting the default one.
 */

export type Trend = 'down2' | 'down' | 'flat' | 'up' | 'up2';
export interface Reading { time: number; mgdl: number; trend?: Trend }

export interface LibreSession { token: string; accountId: string; region: string; expires: number }

export type LibreResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const REGION = /^[a-z]{2}[0-9]?$/;
const host = (region: string) => (region && REGION.test(region) ? `https://api-${region}.libreview.io` : 'https://api.libreview.io');

const headers = (session?: { token: string; accountId: string }): Record<string, string> => ({
    'accept-encoding': 'gzip',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    product: 'llu.android',
    version: process.env.LIBRE_LLU_VERSION || '4.16.0',
    ...(session ? { authorization: `Bearer ${session.token}`, 'account-id': session.accountId } : {})
});

const TRENDS: Record<number, Trend> = { 1: 'down2', 2: 'down', 3: 'flat', 4: 'up', 5: 'up2' };

/** "11/15/2026 9:41:07 AM" in UTC -> epoch milliseconds (NaN when it cannot be read). */
export function parseFactoryTimestamp(value: unknown): number {
    const match = typeof value === 'string' && value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i);
    if (!match) return NaN;
    const [, month, day, year, hour, minute, second, half] = match;
    const h = (Number(hour) % 12) + (half.toUpperCase() === 'PM' ? 12 : 0);
    return Date.UTC(Number(year), Number(month) - 1, Number(day), h, Number(minute), Number(second));
}

function toReading(raw: unknown): Reading | null {
    const m = raw as { ValueInMgPerDl?: number; FactoryTimestamp?: string; TrendArrow?: number } | null;
    const time = parseFactoryTimestamp(m?.FactoryTimestamp);
    const mgdl = Number(m?.ValueInMgPerDl);
    if (!Number.isFinite(time) || !Number.isFinite(mgdl) || mgdl < 20 || mgdl > 600) return null;
    const trend = m?.TrendArrow !== undefined ? TRENDS[m.TrendArrow] : undefined;
    return { time, mgdl, ...(trend ? { trend } : {}) };
}

type Json = Record<string, any>;

/** Signs in with LibreLinkUp credentials. The password is used for this call only and never stored. */
export async function libreLogin(email: string, password: string, fetchImpl: typeof fetch = fetch): Promise<LibreResult<LibreSession>> {
    let region = '';
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetchImpl(`${host(region)}/llu/auth/login`, {
            method: 'POST', headers: headers(), body: JSON.stringify({ email, password })
        });
        if (response.status === 429) return { ok: false, status: 429, error: 'LibreLinkUp ha bloqueado temporalmente los intentos. Espera unos minutos.' };
        const body = await response.json().catch(() => null) as Json | null;
        if (!response.ok || !body) return { ok: false, status: 502, error: `LibreLinkUp respondió ${response.status}` };

        if (body.data?.redirect && typeof body.data.region === 'string' && REGION.test(body.data.region) && attempt === 0) {
            region = body.data.region; // the account lives in another region: ask there
            continue;
        }
        if (body.status === 2) return { ok: false, status: 401, error: 'Correo o contraseña de LibreLinkUp incorrectos' };
        if (body.status === 4 || body.data?.step) {
            return { ok: false, status: 409, error: 'LibreLinkUp pide aceptar sus condiciones: abre la app LibreLinkUp, acéptalas y vuelve a intentarlo' };
        }
        const token = body.data?.authTicket?.token;
        const userId = body.data?.user?.id;
        if (body.status !== 0 || typeof token !== 'string' || typeof userId !== 'string') {
            return { ok: false, status: 502, error: 'Respuesta inesperada de LibreLinkUp' };
        }
        return {
            ok: true,
            data: {
                token, region,
                accountId: createHash('sha256').update(userId).digest('hex'),
                expires: Number(body.data.authTicket.expires) * 1000 || Date.now() + 86400000
            }
        };
    }
    return { ok: false, status: 502, error: 'LibreLinkUp no indicó la región de la cuenta' };
}

/** Latest reading and the last hours of the first person this account follows. */
export async function libreRead(session: { token: string; accountId: string; region: string }, fetchImpl: typeof fetch = fetch): Promise<LibreResult<{ readings: Reading[]; name: string }>> {
    const get = async (path: string) => {
        const response = await fetchImpl(`${host(session.region)}${path}`, { headers: headers(session) });
        return { status: response.status, body: await response.json().catch(() => null) as Json | null };
    };
    const connections = await get('/llu/connections');
    if (connections.status === 401 || connections.status === 403) return { ok: false, status: 401, error: 'La sesión de LibreLinkUp ha caducado: vuelve a conectarla' };
    if (connections.status !== 200 || !Array.isArray(connections.body?.data)) return { ok: false, status: 502, error: `LibreLinkUp respondió ${connections.status}` };
    const connection = connections.body.data[0];
    if (!connection?.patientId) {
        return { ok: false, status: 404, error: 'Esta cuenta de LibreLinkUp no sigue a nadie. Invítala desde la app FreeStyle LibreLink (Compartir).' };
    }
    if (!/^[0-9a-f-]{8,64}$/i.test(String(connection.patientId))) return { ok: false, status: 502, error: 'Respuesta inesperada de LibreLinkUp' };

    const readings: Reading[] = [];
    const graph = await get(`/llu/connections/${connection.patientId}/graph`);
    if (graph.status === 200 && Array.isArray(graph.body?.data?.graphData)) {
        for (const item of graph.body.data.graphData) {
            const reading = toReading(item);
            if (reading) readings.push(reading);
        }
    }
    const latest = toReading(graph.body?.data?.connection?.glucoseMeasurement ?? connection.glucoseMeasurement);
    if (latest) readings.push(latest);
    readings.sort((a, b) => a.time - b.time);
    return { ok: true, data: { readings, name: String(connection.firstName ?? '').slice(0, 40) } };
}
