import type { ServerResponse } from 'node:http';
import { ApiRequest, readBody, sendJson } from './_lib/http.js';
import { requestUid } from './_lib/admin.js';
import { libreLogin, libreRead } from './_lib/librelink.js';

/**
 * POST /api/glucose   (Authorization: Bearer <Firebase ID token>)
 *   { action: "login", email, password }            -> { token, accountId, region, expires }
 *   { action: "read", token, accountId, region }     -> { readings: [{ time, mgdl, trend }], name }
 *
 * Bridge to LibreLinkUp, which browsers cannot call directly. Nothing is stored or logged
 * here: the password is forwarded once to LibreLinkUp and the session it returns is kept
 * only on the user's device.
 */
export default async function handler(req: ApiRequest, res: ServerResponse) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'no-store');
    if (!(await requestUid(req))) return sendJson(res, 401, { error: 'Inicia sesión en la app para usar el sensor' });

    let input: Record<string, unknown>;
    try {
        input = JSON.parse((await readBody(req)).text || '{}');
    } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' });
    }
    const text = (key: string, max: number) => (typeof input[key] === 'string' ? (input[key] as string).slice(0, max) : '');

    try {
        if (input.action === 'login') {
            const email = text('email', 200).trim();
            const password = text('password', 200);
            if (!email || !password) return sendJson(res, 400, { error: 'Faltan el correo o la contraseña' });
            const result = await libreLogin(email, password);
            return result.ok ? sendJson(res, 200, result.data) : sendJson(res, result.status, { error: result.error });
        }
        if (input.action === 'read') {
            const token = text('token', 4000);
            const accountId = text('accountId', 64);
            if (!token || !/^[0-9a-f]{64}$/.test(accountId)) return sendJson(res, 400, { error: 'Sesión de LibreLinkUp no válida' });
            const result = await libreRead({ token, accountId, region: text('region', 3) });
            return result.ok ? sendJson(res, 200, result.data) : sendJson(res, result.status, { error: result.error });
        }
        return sendJson(res, 400, { error: 'Unknown action' });
    } catch (error) {
        console.error('glucose bridge failed', error instanceof Error ? error.message : 'unknown error');
        return sendJson(res, 502, { error: 'No se pudo contactar con LibreLinkUp' });
    }
}
