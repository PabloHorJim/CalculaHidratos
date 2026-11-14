import { X509Certificate, createVerify } from 'node:crypto';
import tls from 'node:tls';

/**
 * Verifies that a request really comes from Alexa, as Amazon requires for skills hosted
 * outside AWS Lambda:
 * https://developer.amazon.com/docs/custom-skills/host-a-custom-skill-as-a-web-service.html
 */

export class AlexaVerificationError extends Error {}

export interface VerifyOptions {
    /** The request body exactly as received (the signature covers these bytes). */
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
    now?: number;
    /** Downloads the certificate chain (PEM). Replaceable for tests. */
    fetchPem?: (url: string) => Promise<string>;
    /** Trusted root certificates (PEM). Defaults to Node's built-in list. */
    trustedRoots?: readonly string[];
    toleranceMs?: number;
    /** When set, the request must be addressed to this skill id. */
    skillId?: string;
}

const REQUIRED_SAN = 'echo-api.amazon.com';
const DEFAULT_TOLERANCE_MS = 150 * 1000;
const chainCache = new Map<string, X509Certificate[]>();

const header = (headers: VerifyOptions['headers'], name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
};

/** The certificate must be served by Amazon: https://s3.amazonaws.com(:443)/echo.api/... */
export function isValidCertUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl); // also normalises "/../" segments
        return url.protocol === 'https:' &&
            url.hostname.toLowerCase() === 's3.amazonaws.com' &&
            (url.port === '' || url.port === '443') &&
            url.pathname.startsWith('/echo.api/');
    } catch {
        return false;
    }
}

const isCurrent = (cert: X509Certificate, now: number) =>
    new Date(cert.validFrom).getTime() <= now && now <= new Date(cert.validTo).getTime();

function parseChain(pem: string): X509Certificate[] {
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
    return blocks.map(block => new X509Certificate(block));
}

function assertTrustedChain(chain: X509Certificate[], roots: readonly string[], now: number) {
    if (chain.length === 0) throw new AlexaVerificationError('empty certificate chain');
    const leaf = chain[0];
    const names = (leaf.subjectAltName ?? '').split(',').map(s => s.trim());
    if (!names.includes(`DNS:${REQUIRED_SAN}`)) throw new AlexaVerificationError('certificate is not for echo-api.amazon.com');

    for (let i = 0; i < chain.length; i++) {
        if (!isCurrent(chain[i], now)) throw new AlexaVerificationError('certificate expired or not yet valid');
        const issuer = chain[i + 1];
        if (issuer && !(chain[i].checkIssued(issuer) && chain[i].verify(issuer.publicKey))) {
            throw new AlexaVerificationError('broken certificate chain');
        }
    }

    const last = chain[chain.length - 1];
    const anchored = roots.some(pem => {
        try {
            const root = new X509Certificate(pem);
            if (!isCurrent(root, now)) return false;
            return root.fingerprint256 === last.fingerprint256 || (last.checkIssued(root) && last.verify(root.publicKey));
        } catch {
            return false;
        }
    });
    if (!anchored) throw new AlexaVerificationError('certificate chain does not lead to a trusted root');
}

const defaultFetchPem = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new AlexaVerificationError(`could not download certificate (${response.status})`);
    return response.text();
};

/** Throws AlexaVerificationError unless the request is a fresh, correctly signed Alexa request. */
export async function verifyAlexaRequest(options: VerifyOptions): Promise<void> {
    const now = options.now ?? Date.now();
    const certUrl = header(options.headers, 'signaturecertchainurl');
    const signature256 = header(options.headers, 'signature-256');
    const signature = signature256 ?? header(options.headers, 'signature');
    if (!certUrl || !signature) throw new AlexaVerificationError('missing signature headers');
    if (!isValidCertUrl(certUrl)) throw new AlexaVerificationError('invalid certificate url');

    let chain = chainCache.get(certUrl);
    if (!chain) {
        chain = parseChain(await (options.fetchPem ?? defaultFetchPem)(certUrl));
        assertTrustedChain(chain, options.trustedRoots ?? tls.rootCertificates, now);
        chainCache.set(certUrl, chain);
    } else if (!chain.every(cert => isCurrent(cert, now))) {
        chainCache.delete(certUrl);
        throw new AlexaVerificationError('certificate expired');
    }

    const verifier = createVerify(signature256 ? 'RSA-SHA256' : 'RSA-SHA1');
    verifier.update(options.rawBody, 'utf8');
    if (!verifier.verify(chain[0].publicKey, signature, 'base64')) {
        throw new AlexaVerificationError('signature does not match the request body');
    }

    let body: any;
    try {
        body = JSON.parse(options.rawBody);
    } catch {
        throw new AlexaVerificationError('body is not JSON');
    }
    const timestamp = new Date(body?.request?.timestamp).getTime();
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > (options.toleranceMs ?? DEFAULT_TOLERANCE_MS)) {
        throw new AlexaVerificationError('request timestamp out of range');
    }

    if (options.skillId) {
        const applicationId = body?.context?.System?.application?.applicationId ?? body?.session?.application?.applicationId;
        if (applicationId !== options.skillId) throw new AlexaVerificationError('request is addressed to another skill');
    }
}

/** For tests. */
export function clearCertificateCache() {
    chainCache.clear();
}
