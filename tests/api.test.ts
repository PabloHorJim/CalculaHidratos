import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSign } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { verifyAlexaRequest, isValidCertUrl, clearCertificateCache, AlexaVerificationError } from '../api/_lib/alexaVerify';
import { readBody, ApiRequest } from '../api/_lib/http';
import authProxy from '../api/auth-proxy';

// ---------- Alexa request verification ----------
const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert.pem';
let dir: string;
let rootPem = '', chainPem = '', leafKey = '', wrongSanChain = '', wrongSanKey = '';

function makeLeaf(name: string, san: string) {
    const run = (args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
    run(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${san}`]);
    writeFileSync(join(dir, `${name}.ext`), `subjectAltName=DNS:${san}\n`);
    run(['x509', '-req', '-in', `${name}.csr`, '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', '2', '-extfile', `${name}.ext`]);
    return { key: readFileSync(join(dir, `${name}.key`), 'utf8'), pem: readFileSync(join(dir, `${name}.pem`), 'utf8') };
}

before(() => {
    dir = mkdtempSync(join(tmpdir(), 'alexa-certs-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'root.key', '-out', 'root.pem', '-days', '2', '-subj', '/CN=Test Root',
        '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign'], { cwd: dir, stdio: 'pipe' });
    rootPem = readFileSync(join(dir, 'root.pem'), 'utf8');
    const good = makeLeaf('leaf', 'echo-api.amazon.com');
    leafKey = good.key;
    chainPem = good.pem + rootPem;
    const bad = makeLeaf('other', 'evil.example.com');
    wrongSanKey = bad.key;
    wrongSanChain = bad.pem + rootPem;
});
after(() => rmSync(dir, { recursive: true, force: true }));

const envelope = (timestamp = new Date().toISOString(), applicationId = 'amzn1.ask.skill.test') => JSON.stringify({
    version: '1.0',
    context: { System: { application: { applicationId } } },
    request: { type: 'LaunchRequest', requestId: 'r1', timestamp, locale: 'es-ES' }
});
const sign = (body: string, key = leafKey) => createSign('RSA-SHA256').update(body, 'utf8').sign(key, 'base64');
const verify = (body: string, over: Partial<Parameters<typeof verifyAlexaRequest>[0]> = {}, key = leafKey) => {
    clearCertificateCache();
    return verifyAlexaRequest({
        rawBody: body,
        headers: { signaturecertchainurl: CERT_URL, 'signature-256': sign(body, key) },
        fetchPem: async () => chainPem,
        trustedRoots: [rootPem],
        ...over
    });
};

test('alexa: a correctly signed, fresh request is accepted', async () => {
    await verify(envelope());
    await verify(envelope(), { skillId: 'amzn1.ask.skill.test' });
});

test('alexa: tampered body, missing headers and other skills are rejected', async () => {
    const body = envelope();
    await assert.rejects(verify(body, { rawBody: body.replace('LaunchRequest', 'IntentRequest') }), AlexaVerificationError);
    await assert.rejects(verify(body, { headers: {} }), /missing signature headers/);
    await assert.rejects(verify(body, { skillId: 'amzn1.ask.skill.other' }), /another skill/);
    // the same JSON re-serialised differently no longer matches the signature
    await assert.rejects(verify(body, { rawBody: JSON.stringify(JSON.parse(body), null, 1) }), /signature does not match/);
});

test('alexa: old requests are rejected (replay protection)', async () => {
    await assert.rejects(verify(envelope(new Date(Date.now() - 10 * 60 * 1000).toISOString())), /timestamp out of range/);
});

test('alexa: certificates that are not Amazon\'s are rejected', async () => {
    const body = envelope();
    await assert.rejects(verify(body, { fetchPem: async () => wrongSanChain }, wrongSanKey), /not for echo-api/);
    await assert.rejects(verify(body, { trustedRoots: [] }), /trusted root/);
    await assert.rejects(verify(body, { trustedRoots: undefined }), /trusted root/); // our test root is not in Node's store
    await assert.rejects(verify(body, { now: Date.now() + 10 * 24 * 3600 * 1000 }), /expired/);
});

test('alexa: certificate url must point to Amazon', () => {
    assert.equal(isValidCertUrl('https://s3.amazonaws.com/echo.api/echo-api-cert.pem'), true);
    assert.equal(isValidCertUrl('https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem'), true);
    assert.equal(isValidCertUrl('https://s3.amazonaws.com/echo.api/../echo.api/echo-api-cert.pem'), true);
    assert.equal(isValidCertUrl('http://s3.amazonaws.com/echo.api/echo-api-cert.pem'), false);
    assert.equal(isValidCertUrl('https://notamazon.com/echo.api/echo-api-cert.pem'), false);
    assert.equal(isValidCertUrl('https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem'), false);
    assert.equal(isValidCertUrl('https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem'), false);
    assert.equal(isValidCertUrl('https://s3.amazonaws.com/echo.api/../other/cert.pem'), false);
});

// ---------- request body ----------
test('readBody: raw stream is exact, an already parsed body is not', async () => {
    const stream = Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]) as unknown as ApiRequest;
    assert.deepEqual(await readBody(stream), { text: '{"a":1}', exact: true });
    const parsed = { readableEnded: true, complete: true, body: { a: 1 } } as unknown as ApiRequest;
    assert.deepEqual(await readBody(parsed), { text: '{"a":1}', exact: false });
});

// ---------- sign-in proxy ----------
test('auth proxy forwards only Firebase sign-in helper paths', async () => {
    const seen: string[] = [];
    const upstream = http.createServer((req, res) => {
        seen.push(req.url ?? '');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<html>handler</html>');
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    process.env.AUTH_PROXY_UPSTREAM = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    const proxy = http.createServer((req, res) => { void authProxy(req as ApiRequest, res); });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/api/auth-proxy`;
    try {
        const ok = await fetch(`${base}?path=/__/auth/handler&apiKey=abc&authType=signInViaRedirect`);
        assert.equal(ok.status, 200);
        assert.equal(await ok.text(), '<html>handler</html>');
        assert.match(ok.headers.get('content-type') ?? '', /text\/html/);
        assert.deepEqual(seen, ['/__/auth/handler?apiKey=abc&authType=signInViaRedirect']);

        assert.equal((await fetch(`${base}?path=/__/firebase/init.json`)).status, 200);
        assert.equal((await fetch(`${base}?path=/secret/admin`)).status, 400);
        assert.equal((await fetch(`${base}?path=/__/auth/../../etc/passwd`)).status, 400);
        assert.equal((await fetch(`${base}?path=//evil.example.com/__/auth/handler`)).status, 400);
        assert.equal((await fetch(`${base}?path=/__/auth/handler`, { method: 'POST' })).status, 405);
        assert.equal(seen.length, 2);
    } finally {
        delete process.env.AUTH_PROXY_UPSTREAM;
        proxy.close(); upstream.close();
    }
});
