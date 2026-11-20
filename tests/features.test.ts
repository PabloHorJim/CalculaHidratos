/** Unit tests for the food, invitation-independent server logic and sensor code added with the "roadmap" work. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IngredientLike } from '../src/utils/nutrition';
import { ingredientCarbs, recipeMacros, scaleIngredients, withExtras, piecesOf, cleanExtra, DEFAULT_EXTRAS } from '../src/utils/nutrition';
import { parseOpenFoodFacts, lookupBarcode, isBarcode } from '../src/utils/openFoodFacts';
import { upsertHistory } from '../src/utils/history';
import { notifyGroup, NotifyDeps, isPushEndpoint } from '../api/_lib/notify';
import { isGroupMember } from '../api/_lib/membership';
import { libreLogin, libreRead, parseFactoryTimestamp } from '../api/_lib/librelink';
import { parseNightscout, normalizeNightscoutUrl, fetchNightscout, fetchLibre, latestReading, GlucoseError } from '../src/glucose/sources';
import { INITIAL_INGREDIENTS } from '../src/data/ingredients';

const pasta: IngredientLike = { id: '12', name: 'Pasta', carbsPer100g: 75.8 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('default extras point at the ingredients they were written for', () => {
    const names: Record<string, RegExp> = { '1': /arroz/i, '12': /pasta/i, '29': /huevo/i, '118': /plátano/i, '11': /molde/i, '91': /lentejas/i, '108': /manzana/i };
    for (const [id, pattern] of Object.entries(names)) {
        assert.match(INITIAL_INGREDIENTS.find(i => i.id === id)!.name, pattern);
        assert.ok(DEFAULT_EXTRAS[id]);
    }
    for (const id of Object.keys(DEFAULT_EXTRAS)) assert.ok(INITIAL_INGREDIENTS.some(i => i.id === id), `no ingredient ${id}`);
});

test('cooked weight is converted back to raw before counting carbohydrates', () => {
    const withFactor = withExtras(pasta);
    assert.equal(withFactor.cookedFactor, 2.3);
    assert.equal(ingredientCarbs(withFactor, { weight: 100 }), 75.8);
    assert.ok(Math.abs(ingredientCarbs(withFactor, { weight: 230, cooked: true }) - 75.8) < 1e-9);
    // without a factor the flag changes nothing (never divides by zero or by rubbish)
    assert.equal(ingredientCarbs(pasta, { weight: 230, cooked: true }), 174.34);
    assert.equal(ingredientCarbs({ ...pasta, cookedFactor: 0 }, { weight: 100, cooked: true }), 75.8);
    assert.equal(ingredientCarbs(undefined, { weight: 100 }), 0);
});

test('family overrides win over defaults, 0 switches a default off, bad values are ignored', () => {
    assert.equal(withExtras(pasta, { '12': { cookedFactor: 2 } }).cookedFactor, 2);
    assert.equal(withExtras(pasta, { '12': { cookedFactor: 0 } }).cookedFactor, undefined);
    assert.equal(withExtras(pasta, { '12': { cookedFactor: 'x' } }).cookedFactor, 2.3);
    assert.equal(withExtras(pasta, { '12': { cookedFactor: 500 } }).cookedFactor, 2.3);
    const banana = withExtras<IngredientLike>({ id: '118', name: 'Plátano', carbsPer100g: 20 }, { '118': { unitWeight: 100 } });
    assert.equal(banana.unitWeight, 100);
    assert.equal(banana.unitName, 'plátano');
    assert.equal(piecesOf(banana, 150), 1.5);
    assert.equal(piecesOf(pasta, 150), null);
    assert.deepEqual(cleanExtra({ unitWeight: -1, fatPer100g: 200, proteinPer100g: 0, unitName: '  ' }), { proteinPer100g: 0 });
    // custom ingredient with its own values and no override
    const own = withExtras({ id: 'c1', name: 'Pan casero', carbsPer100g: 50, unitWeight: 40 }, {});
    assert.equal(own.unitWeight, 40);
});

test('recipe totals: carbs always, fat and protein only when every ingredient has them', () => {
    const find = (id: string) => ({
        a: { id: 'a', name: 'A', carbsPer100g: 10, fatPer100g: 5, proteinPer100g: 2 },
        b: { id: 'b', name: 'B', carbsPer100g: 50 }
    } as Record<string, { id: string; name: string; carbsPer100g: number }>)[id];
    assert.deepEqual(recipeMacros([{ ingredientId: 'a', weight: 200 }], find), { carbs: 20, fat: 10, protein: 4, complete: true });
    const mixed = recipeMacros([{ ingredientId: 'a', weight: 200 }, { ingredientId: 'b', weight: 100 }, { ingredientId: 'gone', weight: 50 }], find);
    assert.equal(mixed.carbs, 70);
    assert.equal(mixed.complete, false);
    assert.equal(recipeMacros([], find).complete, false);
});

test('scaling a recipe', () => {
    const items = [{ ingredientId: 'a', weight: 125 }, { ingredientId: 'b', weight: 30, cooked: true }];
    assert.deepEqual(scaleIngredients(items, 1.5), [{ ingredientId: 'a', weight: 188 }, { ingredientId: 'b', weight: 45, cooked: true }]);
    assert.equal(scaleIngredients(items, 0), items);
    assert.equal(scaleIngredients(items, NaN), items);
});

test('a snack never replaces or is replaced by the family dish of the same name', () => {
    const now = Date.parse('2026-11-15T13:00:00Z');
    const snack = { id: '1', timestamp: new Date(now - 60000).toISOString(), recipeName: 'Pan', totalCarbs: 20, netWeight: 40, kind: 'single' as const, portions: [] };
    const list = upsertHistory([snack], { recipeName: 'Pan', totalCarbs: 300 }, now);
    assert.equal(list.length, 2);
    assert.ok(list.some(m => m.kind === 'single' && m.totalCarbs === 20));
});

test('Open Food Facts: reads carbohydrates, refuses products without them', async () => {
    assert.ok(isBarcode('8410000000000'));
    assert.ok(!isBarcode('84100x'));
    const product = { status: 1, product: { product_name_es: 'Galletas María', brands: 'Marca, Otra', nutriments: { carbohydrates_100g: 74.26, fat_100g: '11', proteins_100g: 7 } } };
    assert.deepEqual(parseOpenFoodFacts('8410000000000', product), { barcode: '8410000000000', name: 'Galletas María (Marca)', carbsPer100g: 74.3, fatPer100g: 11, proteinPer100g: 7 });
    assert.equal(parseOpenFoodFacts('1', { status: 1, product: { product_name: 'x', nutriments: {} } }), null);
    assert.equal(parseOpenFoodFacts('1', { status: 1, product: { nutriments: { carbohydrates_100g: 250 } } }), null);
    assert.equal(parseOpenFoodFacts('1', { status: 0 }), null);
    let asked = '';
    const found = await lookupBarcode(' 8410000000000 ', (async (url: string) => { asked = url; return json(product); }) as unknown as typeof fetch);
    assert.equal(found?.carbsPer100g, 74.3);
    assert.ok(asked.includes('/product/8410000000000.json'));
    assert.equal(await lookupBarcode('abc', (async () => { throw new Error('must not be called'); }) as unknown as typeof fetch), null);
    assert.equal(await lookupBarcode('84100000', (async () => json({}, 404)) as unknown as typeof fetch), null);
});

test('family notifications: only members can send, the sender is skipped, dead devices are removed', async () => {
    const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: 'k', auth: 'a' } });
    const sent: string[] = [];
    const removed: string[] = [];
    const deps: NotifyDeps = {
        groupMembers: async id => (id === 'G1' ? ['ana', 'bob', 'carl'] : null),
        subscriptions: async uid => ({ ana: { a1: sub(1) }, bob: { b1: sub(2), b2: sub(3), bad: { endpoint: 'http://x' } as never }, carl: {} } as Record<string, Record<string, ReturnType<typeof sub>>>)[uid] ?? {},
        send: async (s, payload) => { sent.push(s.endpoint + ' ' + JSON.parse(payload).title); return s.endpoint.endsWith('/3') ? 'gone' : 'ok'; },
        removeSubscription: async (uid, id) => { removed.push(`${uid}/${id}`); }
    };
    assert.deepEqual(await notifyGroup(deps, 'ana', { groupId: 'G1', title: 'Lentejas: reparto listo', body: 'Pablo: 45 g HC' }), { status: 200, body: { sent: 1, devices: 2 } });
    assert.deepEqual(sent.sort(), ['https://fcm.googleapis.com/fcm/send/2 Lentejas: reparto listo', 'https://fcm.googleapis.com/fcm/send/3 Lentejas: reparto listo']);
    assert.deepEqual(removed, ['bob/b2']);
    assert.equal((await notifyGroup(deps, 'eve', { groupId: 'G1', title: 'x' })).status, 403);
    assert.equal((await notifyGroup(deps, 'ana', { groupId: 'NOPE', title: 'x' })).status, 403);
    assert.equal((await notifyGroup(deps, 'ana', { groupId: 'G1' })).status, 400);
    assert.equal((await notifyGroup(deps, 'ana', { groupId: 'a/b', title: 'x' })).status, 400);
    assert.equal((await notifyGroup(deps, 'ana', null)).status, 400);
});

test('notifications only go to the browsers\' push services', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x',
        'https://web.push.apple.com/QX', 'https://wns2-db5p.notify.windows.com/w/?token=1']) assert.ok(isPushEndpoint(ok), ok);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://evil.com/fcm.googleapis.com',
        'https://fcm.googleapis.com.evil.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'nonsense']) assert.ok(!isPushEndpoint(bad), bad);
});

test('server-side group access needs the same membership as the rules', () => {
    assert.ok(isGroupMember({ memberUids: ['ana', 'bob'] }, 'bob'));
    assert.ok(!isGroupMember({ memberUids: ['ana'] }, 'eve'));
    assert.ok(!isGroupMember({ memberUids: 'eve' }, 'eve'));
    assert.ok(isGroupMember({ name: 'old group' }, 'ana'));
});

test('LibreLinkUp: region redirect, session, readings; errors are explained', async () => {
    assert.equal(parseFactoryTimestamp('11/15/2026 9:41:07 AM'), Date.UTC(2026, 10, 15, 9, 41, 7));
    assert.equal(parseFactoryTimestamp('11/15/2026 12:05:00 AM'), Date.UTC(2026, 10, 15, 0, 5, 0));
    assert.equal(parseFactoryTimestamp('11/15/2026 12:05:00 PM'), Date.UTC(2026, 10, 15, 12, 5, 0));
    assert.ok(Number.isNaN(parseFactoryTimestamp('yesterday')));

    const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const server = (async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined });
        if (url === 'https://api.libreview.io/llu/auth/login') return json({ status: 0, data: { redirect: true, region: 'eu' } });
        if (url === 'https://api-eu.libreview.io/llu/auth/login') {
            return JSON.parse(String(init?.body)).password === 'right'
                ? json({ status: 0, data: { user: { id: 'user-123' }, authTicket: { token: 'TOKEN', expires: 1800000000 } } })
                : json({ status: 2, error: { message: 'notAuthenticated' } });
        }
        if (url === 'https://api-eu.libreview.io/llu/connections') {
            return init?.headers && (init.headers as Record<string, string>).authorization === 'Bearer TOKEN'
                ? json({ status: 0, data: [{ patientId: 'abcd1234-0000-0000-0000-000000000000', firstName: 'Pablo', glucoseMeasurement: { ValueInMgPerDl: 150, TrendArrow: 3, FactoryTimestamp: '11/15/2026 9:40:00 AM' } }] })
                : json({}, 401);
        }
        if (url.endsWith('/graph')) {
            return json({ status: 0, data: {
                connection: { glucoseMeasurement: { ValueInMgPerDl: 142, TrendArrow: 4, FactoryTimestamp: '11/15/2026 9:41:07 AM' } },
                graphData: [{ ValueInMgPerDl: 120, FactoryTimestamp: '11/15/2026 9:25:00 AM' }, { ValueInMgPerDl: 9999, FactoryTimestamp: '11/15/2026 9:30:00 AM' }, { ValueInMgPerDl: 110, FactoryTimestamp: '11/15/2026 9:10:00 AM' }]
            } });
        }
        return json({}, 404);
    }) as unknown as typeof fetch;

    const bad = await libreLogin('a@example.com', 'wrong', server);
    assert.deepEqual(bad.ok ? null : bad.status, 401);
    const login = await libreLogin('a@example.com', 'right', server);
    assert.ok(login.ok);
    if (!login.ok) return;
    assert.equal(login.data.region, 'eu');
    assert.equal(login.data.token, 'TOKEN');
    assert.match(login.data.accountId, /^[0-9a-f]{64}$/);
    assert.equal(login.data.expires, 1800000000000);

    const read = await libreRead(login.data, server);
    assert.ok(read.ok);
    if (!read.ok) return;
    assert.deepEqual(read.data.readings.map(r => r.mgdl), [110, 120, 142]); // sorted, impossible value dropped
    assert.equal(read.data.readings[2].trend, 'up');
    const authed = calls.find(c => c.url.endsWith('/llu/connections'))!;
    assert.equal(authed.headers['account-id'], login.data.accountId);
    assert.ok(calls.every(c => c.url.startsWith('https://api.libreview.io/') || c.url.startsWith('https://api-eu.libreview.io/')));

    const expired = await libreRead({ ...login.data, token: 'OLD' }, server);
    assert.equal(expired.ok ? 0 : expired.status, 401);
    // a made-up region can never send the request to another host
    const odd = await libreRead({ ...login.data, region: 'evil.example.com/x' }, server);
    assert.ok(calls[calls.length - 1].url.startsWith('https://api.libreview.io/') || !odd.ok);
    const terms = await libreLogin('a@example.com', 'x', (async () => json({ status: 4, data: { step: { type: 'tou' } } })) as unknown as typeof fetch);
    assert.equal(terms.ok ? 0 : terms.status, 409);
});

test('Nightscout and reading freshness', async () => {
    assert.equal(normalizeNightscoutUrl('misitio.example.com/'), 'https://misitio.example.com');
    assert.equal(normalizeNightscoutUrl('http://misitio.example.com'), null);
    assert.equal(normalizeNightscoutUrl('   '), null);
    const entries = [{ sgv: 150, date: 2000, direction: 'FortyFiveUp' }, { sgv: 140, date: 1000, direction: 'Flat' }, { sgv: 5, date: 3000 }, { mbg: 100, date: 4000 }];
    assert.deepEqual(parseNightscout(entries), [{ time: 1000, mgdl: 140, trend: 'flat' }, { time: 2000, mgdl: 150, trend: 'up' }]);
    assert.deepEqual(parseNightscout({ error: 'x' }), []);

    let asked = '';
    const readings = await fetchNightscout({ type: 'nightscout', nightscoutUrl: 'ns.example.com', nightscoutToken: 'tok en' },
        (async (url: string) => { asked = url; return json(entries); }) as unknown as typeof fetch);
    assert.equal(readings.length, 2);
    assert.equal(asked, 'https://ns.example.com/api/v1/entries/sgv.json?count=72&token=tok%20en');
    await assert.rejects(fetchNightscout({ type: 'nightscout', nightscoutUrl: 'ns.example.com' }, (async () => json({}, 401)) as unknown as typeof fetch), GlucoseError);
    await assert.rejects(fetchLibre({ type: 'librelinkup', libre: { token: 't', accountId: 'a', region: 'eu', expires: Date.now() - 1 } }, 'id'), GlucoseError);

    const now = 1_000_000_000;
    assert.equal(latestReading([], now), null);
    assert.deepEqual(latestReading([{ time: now - 4 * 60000, mgdl: 130 }], now), { reading: { time: now - 4 * 60000, mgdl: 130 }, ageMinutes: 4, fresh: true });
    assert.equal(latestReading([{ time: now - 11 * 60000, mgdl: 130 }], now)!.fresh, false);   // too old to dose with
    assert.equal(latestReading([{ time: now + 10 * 60000, mgdl: 130 }], now)!.fresh, false);   // clock problem
});

test('every serverless endpoint can be loaded (a bad import only shows up as a crash once deployed)', async () => {
    for (const name of ['notify', 'glucose', 'alexa', 'auth-proxy']) {
        const module = await import(`../api/${name}.ts`);
        assert.equal(typeof module.default, 'function', name);
    }
});
