import type { ServerResponse } from 'node:http';
import { ApiRequest, sendJson } from './_lib/http.js';

/**
 * Serves Firebase's sign-in helper pages (/__/auth/*) from the app's own domain.
 *
 * Browsers block third-party storage, so "sign in with redirect" only works when those
 * pages live on the same site as the app. vercel.json rewrites /__/auth/* and
 * /__/firebase/init.json to this function, which fetches them from
 * https://<project>.firebaseapp.com. See README ("Sign-in inside the installed app").
 */

const ALLOWED = /^\/__\/(auth\/[A-Za-z0-9._\-/]+|firebase\/init\.json)$/;

export default async function handler(req: ApiRequest, res: ServerResponse) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    const upstream = process.env.AUTH_PROXY_UPSTREAM || (projectId ? `https://${projectId}.firebaseapp.com` : '');
    if (!upstream) return sendJson(res, 500, { error: 'FIREBASE_PROJECT_ID is not configured' });

    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.searchParams.get('path') ?? '';
    if (!ALLOWED.test(path) || path.includes('..')) return sendJson(res, 400, { error: 'Invalid path' });
    url.searchParams.delete('path');
    const query = url.searchParams.toString();

    try {
        const response = await fetch(`${upstream}${path}${query ? `?${query}` : ''}`, { method: req.method, redirect: 'manual' });
        res.statusCode = response.status;
        for (const name of ['content-type', 'cache-control', 'location', 'etag', 'last-modified']) {
            const value = response.headers.get(name);
            if (value) res.setHeader(name, value);
        }
        res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        console.error('auth proxy failed', error);
        sendJson(res, 502, { error: 'Upstream unavailable' });
    }
}
