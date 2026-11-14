import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Helpers that work with or without Vercel's request helpers (NODEJS_HELPERS=0), so the
 * functions can read the body exactly as it was sent.
 */

export type ApiRequest = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
    const body = JSON.stringify(payload);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json;charset=utf-8');
    res.end(body);
}

/**
 * Returns the request body as text. `exact` is false when the platform had already parsed
 * it and the text had to be rebuilt from the parsed object (it may then differ byte for
 * byte from what was sent, which matters for signature checks).
 */
export async function readBody(req: ApiRequest): Promise<{ text: string; exact: boolean }> {
    if (!req.readableEnded && !req.complete) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        if (chunks.length > 0) return { text: Buffer.concat(chunks).toString('utf8'), exact: true };
    }
    const parsed = req.body;
    if (typeof parsed === 'string') return { text: parsed, exact: true };
    if (Buffer.isBuffer(parsed)) return { text: parsed.toString('utf8'), exact: true };
    if (parsed && typeof parsed === 'object') return { text: JSON.stringify(parsed), exact: false };
    return { text: '', exact: true };
}
