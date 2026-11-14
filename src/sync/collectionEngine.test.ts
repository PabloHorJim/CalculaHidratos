import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollectionSyncEngine, CollectionTransport, CollectionSnapshot, CollectionBaseStore } from './collectionEngine';
import type { SyncStatus } from './engine';

interface Meal { id: string; t: number; name?: string }
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 1));
const settle = async () => { for (let i = 0; i < 30; i++) await tick(); };
const ids = (list: { id: string }[]) => list.map(x => x.id).sort();
const newestFirst = (list: Meal[]) => [...list].sort((a, b) => b.t - a.t);

class FakeServer {
    docs = new Map<string, Meal>();
    writes = 0;
    window = 1000;
    clients = new Set<FakeClient>();
    connect() { const c = new FakeClient(this); this.clients.add(c); return c; }
    view() { return newestFirst([...this.docs.values()]).slice(0, this.window); }
    commit(sets: Meal[], deletes: string[]) {
        for (const r of sets) this.docs.set(r.id, JSON.parse(JSON.stringify(r)));
        for (const id of deletes) this.docs.delete(id);
        this.writes += sets.length + deletes.length;
        for (const c of this.clients) c.serverChanged();
    }
}

class FakeClient implements CollectionTransport<Meal> {
    online = true;
    private cache: Meal[] = [];
    private listeners = new Set<(s: CollectionSnapshot<Meal>) => void>();
    constructor(private server: FakeServer) {}
    private emit() {
        if (this.online) this.cache = this.server.view();
        const snapshot = { docs: JSON.parse(JSON.stringify(this.cache)), fromCache: !this.online };
        for (const l of this.listeners) queueMicrotask(() => l(snapshot));
    }
    serverChanged() { if (this.online) this.emit(); }
    setOnline(online: boolean) { this.online = online; this.emit(); }
    subscribe(_path: string, onSnapshot: (s: CollectionSnapshot<Meal>) => void) {
        this.listeners.add(onSnapshot);
        this.emit();
        return () => { this.listeners.delete(onSnapshot); };
    }
    async commit(_path: string, sets: Meal[], deletes: string[]) {
        await tick();
        if (!this.online) throw Object.assign(new Error('offline'), { code: 'unavailable' });
        this.server.commit(sets, deletes);
    }
}

class Device {
    state: Meal[];
    status: SyncStatus = 'off';
    seeded = 0;
    client: FakeClient;
    engine!: CollectionSyncEngine<Meal>;
    private baseData: Meal[] | null = null;
    private store: CollectionBaseStore<Meal> = { load: () => this.baseData, save: (_p, r) => { this.baseData = r; } };
    constructor(server: FakeServer, initial: Meal[] = [], private seed: Meal[] | null = null) {
        this.client = server.connect();
        this.state = initial;
        this.open();
    }
    open() {
        this.engine?.stop();
        this.engine = new CollectionSyncEngine<Meal>({
            path: 'groups/G/meals',
            transport: this.client,
            baseStore: this.store,
            initialLocal: this.state,
            apply: records => { this.state = records; },
            onStatus: s => { this.status = s; },
            normalize: newestFirst,
            seed: () => this.seed,
            onSeeded: () => { this.seeded++; this.seed = null; },
            debounceMs: 0
        });
        this.engine.start();
    }
    edit(change: (list: Meal[]) => Meal[]) {
        this.state = change(this.state);
        this.engine.setLocal(this.state);
        this.engine.notifyLocalChange();
    }
}

test('migration: legacy and local meals are uploaded once, by whichever devices arrive', async () => {
    const server = new FakeServer();
    const legacy = [{ id: 'm1', t: 1 }, { id: 'm2', t: 2 }];
    const a = new Device(server, [{ id: 'm2', t: 2 }, { id: 'm3', t: 3 }], legacy);
    const b = new Device(server, [{ id: 'm1', t: 1 }], legacy);
    await settle();
    assert.deepEqual(ids([...server.docs.values()]), ['m1', 'm2', 'm3']);
    for (const d of [a, b]) {
        assert.deepEqual(d.state.map(m => m.id), ['m3', 'm2', 'm1']);
        assert.equal(d.seeded, 1);
        assert.equal(d.status, 'synced');
    }
});

test('a device with old local history adopts the cloud and deletes nothing', async () => {
    const server = new FakeServer();
    server.commit([{ id: 'new', t: 5 }], []);
    const writes = server.writes;
    const stale = new Device(server, [{ id: 'old', t: 1 }]);
    await settle();
    assert.deepEqual(stale.state, [{ id: 'new', t: 5 }]);
    assert.equal(server.writes, writes);
});

test('each change writes only the affected meal', async () => {
    const server = new FakeServer();
    server.commit(Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, t: i })), []);
    const a = new Device(server);
    const b = new Device(server);
    await settle();
    const before = server.writes;
    a.edit(list => [{ id: 'lunch', t: 100 }, ...list]);
    await settle();
    a.edit(list => list.map(m => (m.id === 'lunch' ? { ...m, name: 'Paella' } : m)));
    await settle();
    b.edit(list => list.filter(m => m.id !== 'm0'));
    await settle();
    assert.equal(server.writes - before, 3);
    assert.equal(a.state.length, 50);
    assert.deepEqual(ids(a.state), ids(b.state));
    assert.equal(b.state.find(m => m.id === 'lunch')?.name, 'Paella');
});

test('offline additions and deletions are merged on reconnect, even after a restart', async () => {
    const server = new FakeServer();
    server.commit([{ id: 'm1', t: 1 }, { id: 'm2', t: 2 }], []);
    const phone = new Device(server);
    const tablet = new Device(server);
    await settle();
    phone.client.setOnline(false);
    await settle();
    phone.edit(list => [{ id: 'offline', t: 10 }, ...list.filter(m => m.id !== 'm1')]);
    tablet.edit(list => [{ id: 'tablet', t: 11 }, ...list]);
    await settle();
    phone.open();
    await settle();
    assert.equal(phone.status, 'offline');
    phone.client.setOnline(true);
    await settle();
    for (const d of [phone, tablet]) assert.deepEqual(ids(d.state), ['m2', 'offline', 'tablet']);
    assert.deepEqual(ids([...server.docs.values()]), ['m2', 'offline', 'tablet']);
});

test('meals that fall out of the remote window are not deleted on the server', async () => {
    const server = new FakeServer();
    server.window = 3;
    server.commit([{ id: 'm1', t: 1 }, { id: 'm2', t: 2 }, { id: 'm3', t: 3 }], []);
    const a = new Device(server);
    await settle();
    a.edit(list => [{ id: 'm4', t: 4 }, ...list]);
    await settle();
    assert.deepEqual(a.state.map(m => m.id), ['m4', 'm3', 'm2']);
    assert.equal(server.docs.size, 4);
    assert.equal(a.status, 'synced');
});

test('fuzz: three devices always converge and lose no additions', async () => {
    for (let seed = 1; seed <= 20; seed++) {
        let x = seed * 2654435761 % 2147483647;
        const rnd = (n: number) => { x = (x * 48271) % 2147483647; return x % n; };
        const server = new FakeServer();
        const devices = [new Device(server), new Device(server), new Device(server)];
        await settle();
        const added = new Set<string>(); const deleted = new Set<string>();
        for (let step = 0; step < 40; step++) {
            const d = devices[rnd(3)];
            const action = rnd(10);
            if (action < 5) { const id = `s${seed}-${step}`; added.add(id); d.edit(l => [{ id, t: step }, ...l]); }
            else if (action < 6 && d.state.length) { const v = d.state[rnd(d.state.length)].id; deleted.add(v); d.edit(l => l.filter(m => m.id !== v)); }
            else if (action < 8) d.client.setOnline(!d.client.online);
            else if (action < 9) d.open();
            for (let i = 0; i < rnd(4); i++) await tick();
        }
        for (const d of devices) d.client.setOnline(true);
        await settle(); await settle();
        const expected = [...added].filter(id => !deleted.has(id)).sort();
        for (const d of devices) {
            assert.equal(d.status, 'synced', `seed ${seed}`);
            assert.deepEqual(ids(d.state), expected, `seed ${seed}`);
        }
        assert.deepEqual(ids([...server.docs.values()]), expected, `seed ${seed}: server`);
        for (const d of devices) d.engine.stop();
    }
});
