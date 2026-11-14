import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine, SyncTransport, RemoteSnapshot, BaseStore, SyncStatus } from './engine';
import { canon } from './merge';

// ---------- a tiny in-memory "Firestore" ----------
class FakeServer {
    docs = new Map<string, Record<string, unknown>>();
    writes = 0;
    private clients = new Set<FakeClient>();

    connect() {
        const client = new FakeClient(this);
        this.clients.add(client);
        return client;
    }
    write(path: string, fields: Record<string, unknown>) {
        this.docs.set(path, { ...(this.docs.get(path) ?? {}), ...JSON.parse(JSON.stringify(fields)) });
        this.writes++;
        for (const c of this.clients) c.serverChanged(path);
    }
}

class FakeClient implements SyncTransport {
    online = true;
    private cache = new Map<string, Record<string, unknown>>();
    private listeners = new Map<string, Set<(s: RemoteSnapshot) => void>>();
    constructor(private server: FakeServer) {}

    private emit(path: string) {
        if (this.online) {
            const doc = this.server.docs.get(path);
            if (doc) this.cache.set(path, doc); else this.cache.delete(path);
        }
        const data = this.cache.get(path);
        const snapshot: RemoteSnapshot = { exists: !!data, data: data ? JSON.parse(JSON.stringify(data)) : {}, fromCache: !this.online };
        for (const l of this.listeners.get(path) ?? []) queueMicrotask(() => l(snapshot));
    }
    serverChanged(path: string) { if (this.online) this.emit(path); }
    setOnline(online: boolean) {
        this.online = online;
        for (const path of this.listeners.keys()) this.emit(path);
    }
    subscribe(path: string, onSnapshot: (s: RemoteSnapshot) => void) {
        if (!this.listeners.has(path)) this.listeners.set(path, new Set());
        this.listeners.get(path)!.add(onSnapshot);
        this.emit(path);
        return () => { this.listeners.get(path)?.delete(onSnapshot); };
    }
    async transact(path: string, update: (server: { exists: boolean; data: Record<string, unknown> }) => Record<string, unknown> | null) {
        await tick(); // network latency
        if (!this.online) throw Object.assign(new Error('offline'), { code: 'unavailable' });
        const doc = this.server.docs.get(path);
        const fields = update({ exists: !!doc, data: doc ? JSON.parse(JSON.stringify(doc)) : {} });
        if (fields) this.server.write(path, fields);
    }
}

// ---------- a device running the app ----------
interface State extends Record<string, unknown> {
    mealHistory: { id: string; name?: string }[];
    recipes: { id: string; name: string }[];
    currentRecipeName: string;
}
const FIELDS = { mealHistory: { key: 'id' }, recipes: { key: 'id' }, currentRecipeName: {} };
const EMPTY: State = { mealHistory: [], recipes: [], currentRecipeName: '' };

class Device {
    state: State;
    status: SyncStatus = 'off';
    client: FakeClient;
    engine!: SyncEngine<State>;
    private baseData: { path: string; data: Record<string, unknown> } | null = null;
    private store: BaseStore = {
        load: path => (this.baseData?.path === path ? this.baseData.data : null),
        save: (path, data) => { this.baseData = { path, data }; }
    };

    constructor(server: FakeServer, private path: string, initial: Partial<State> = {}, private createIfMissing = true) {
        this.client = server.connect();
        this.state = { ...EMPTY, ...initial };
        this.open();
    }
    /** (Re)starts the app: a new engine with whatever state and base were persisted. */
    open() {
        this.engine?.stop();
        this.engine = new SyncEngine<State>({
            path: this.path,
            fields: FIELDS,
            transport: this.client,
            baseStore: this.store,
            initialLocal: this.state,
            apply: patch => { this.state = { ...this.state, ...patch }; this.engine.setLocal(this.state); },
            onStatus: s => { this.status = s; },
            extraOnWrite: () => ({ uid: 'owner' }),
            createIfMissing: this.createIfMissing,
            debounceMs: 0
        });
        this.engine.start();
    }
    edit(change: (s: State) => Partial<State>) {
        this.state = { ...this.state, ...change(this.state) };
        this.engine.setLocal(this.state);
        this.engine.notifyLocalChange();
    }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 1));
const settle = async () => { for (let i = 0; i < 30; i++) await tick(); };
const ids = (list: { id: string }[]) => list.map(x => x.id).sort();
const PATH = 'groups/FAMILY';

test('a device with old local data adopts the cloud copy and writes nothing', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { mealHistory: [{ id: 'new' }], recipes: [{ id: 'r1', name: 'Paella' }], currentRecipeName: 'Paella' });
    const stale = new Device(server, PATH, { mealHistory: [{ id: 'old' }], recipes: [] });
    await settle();
    assert.deepEqual(stale.state.mealHistory, [{ id: 'new' }]);
    assert.equal(stale.state.currentRecipeName, 'Paella');
    assert.equal(server.writes, 0);
    assert.equal(stale.status, 'synced');
});

test('two devices adding meals at the same moment keep both meals', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { ...EMPTY, mealHistory: [{ id: 'm0' }] });
    const a = new Device(server, PATH);
    const b = new Device(server, PATH);
    await settle();

    a.edit(s => ({ mealHistory: [{ id: 'a1' }, ...s.mealHistory] }));
    b.edit(s => ({ mealHistory: [{ id: 'b1' }, ...s.mealHistory] }));
    await settle();

    for (const d of [a, b]) assert.deepEqual(ids(d.state.mealHistory), ['a1', 'b1', 'm0']);
    assert.deepEqual(ids(server.docs.get(PATH)!.mealHistory as any), ['a1', 'b1', 'm0']);
});

test('offline edits are merged when the connection comes back, even after restarting the app', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { ...EMPTY, recipes: [{ id: 'r1', name: 'Paella' }, { id: 'r2', name: 'Sopa' }] });
    const phone = new Device(server, PATH);
    const tablet = new Device(server, PATH);
    await settle();

    phone.client.setOnline(false);
    await settle();
    phone.edit(s => ({ mealHistory: [{ id: 'offline-meal' }], recipes: s.recipes.filter(r => r.id !== 'r2') }));
    await settle();
    assert.equal(phone.status, 'offline');
    assert.equal(server.writes, 0);

    tablet.edit(s => ({
        mealHistory: [{ id: 'tablet-meal' }],
        recipes: [...s.recipes.map(r => (r.id === 'r1' ? { ...r, name: 'Paella mixta' } : r)), { id: 'r3', name: 'Tarta' }]
    }));
    await settle();

    phone.open(); // app closed and reopened while still offline
    await settle();
    assert.deepEqual(ids(phone.state.mealHistory), ['offline-meal']);

    phone.client.setOnline(true);
    await settle();

    for (const d of [phone, tablet]) {
        assert.deepEqual(ids(d.state.mealHistory), ['offline-meal', 'tablet-meal']);
        assert.deepEqual(d.state.recipes.map(r => `${r.id}:${r.name}`).sort(), ['r1:Paella mixta', 'r3:Tarta']);
    }
    assert.equal(phone.status, 'synced');
});

test('a remote change (e.g. Alexa adding an ingredient) is applied without echo writes', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { ...EMPTY });
    const a = new Device(server, PATH);
    const b = new Device(server, PATH);
    await settle();

    server.write(PATH, { currentRecipeName: 'Receta de Alexa' });
    await settle();
    assert.equal(a.state.currentRecipeName, 'Receta de Alexa');
    assert.equal(b.state.currentRecipeName, 'Receta de Alexa');
    assert.equal(server.writes, 1); // only the external write: nobody wrote it back
});

test('only changed fields are written, and devices converge without ping-pong', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { ...EMPTY, recipes: [{ id: 'r1', name: 'Paella' }] });
    const a = new Device(server, PATH);
    const b = new Device(server, PATH);
    await settle();

    const written: string[][] = [];
    const original = server.write.bind(server);
    server.write = (path, fields) => { written.push(Object.keys(fields).sort()); original(path, fields); };

    a.edit(() => ({ currentRecipeName: 'Lentejas' }));
    await settle();
    assert.deepEqual(written, [['currentRecipeName', 'uid', 'updatedAt']]);
    assert.equal(b.state.currentRecipeName, 'Lentejas');
    assert.equal(canon(a.state), canon(b.state));
});

test('typing while an upload is in flight is not lost', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { ...EMPTY });
    const a = new Device(server, PATH);
    await settle();
    a.edit(() => ({ currentRecipeName: 'Len' }));
    await tick();
    a.edit(() => ({ currentRecipeName: 'Lentejas' }));
    await settle();
    assert.equal(a.state.currentRecipeName, 'Lentejas');
    assert.equal(server.docs.get(PATH)!.currentRecipeName, 'Lentejas');
});

test('a personal document is created on first sync; a missing group document is never created', async () => {
    const server = new FakeServer();
    const personal = new Device(server, 'users/u1', { recipes: [{ id: 'r1', name: 'Paella' }] });
    await settle();
    assert.deepEqual(server.docs.get('users/u1')!.recipes, [{ id: 'r1', name: 'Paella' }]);
    assert.equal(server.docs.get('users/u1')!.uid, 'owner');

    const orphan = new Device(server, 'groups/GONE', { recipes: [{ id: 'r1', name: 'Paella' }] }, false);
    await settle();
    assert.equal(server.docs.has('groups/GONE'), false);
    assert.equal(orphan.status, 'error');
});

test('values containing undefined do not break the upload', async () => {
    const server = new FakeServer();
    server.docs.set(PATH, { ...EMPTY });
    const a = new Device(server, PATH);
    await settle();
    a.edit(() => ({ mealHistory: [{ id: 'm1', name: undefined }] }));
    await settle();
    assert.deepEqual(server.docs.get(PATH)!.mealHistory, [{ id: 'm1' }]);
    assert.equal(a.status, 'synced');
});

test('fuzz: three devices editing, going offline and restarting always converge and lose no additions', async () => {
    for (let seed = 1; seed <= 25; seed++) {
        let x = seed * 2654435761 % 2147483647;
        const rnd = (n: number) => { x = (x * 48271) % 2147483647; return x % n; };

        const server = new FakeServer();
        server.docs.set(PATH, { ...EMPTY });
        const devices = [new Device(server, PATH), new Device(server, PATH), new Device(server, PATH)];
        await settle();

        const added = new Set<string>();
        const deleted = new Set<string>();
        for (let step = 0; step < 40; step++) {
            const d = devices[rnd(3)];
            const action = rnd(10);
            if (action < 5) {
                const id = `s${seed}-${step}`;
                added.add(id);
                d.edit(s => ({ mealHistory: [{ id }, ...s.mealHistory] }));
            } else if (action < 6 && d.state.mealHistory.length > 0) {
                const victim = d.state.mealHistory[rnd(d.state.mealHistory.length)].id;
                deleted.add(victim);
                d.edit(s => ({ mealHistory: s.mealHistory.filter(m => m.id !== victim) }));
            } else if (action < 7) {
                d.edit(() => ({ currentRecipeName: `name-${step}` }));
            } else if (action < 8) {
                d.client.setOnline(!d.client.online);
            } else if (action < 9) {
                d.open();
            }
            for (let i = 0; i < rnd(4); i++) await tick();
        }
        for (const d of devices) d.client.setOnline(true);
        await settle();
        await settle();

        const expected = [...added].filter(id => !deleted.has(id)).sort();
        const serverDoc = server.docs.get(PATH)!;
        for (const d of devices) {
            assert.equal(d.status, 'synced', `seed ${seed}: status`);
            assert.deepEqual(ids(d.state.mealHistory), expected, `seed ${seed}: history`);
            assert.equal(d.state.currentRecipeName, serverDoc.currentRecipeName, `seed ${seed}: name`);
        }
        assert.deepEqual(ids(serverDoc.mealHistory as any), expected, `seed ${seed}: server`);
        const writesAfter = server.writes;
        await settle();
        assert.equal(server.writes, writesAfter, `seed ${seed}: no writes once converged`);
        for (const d of devices) d.engine.stop();
    }
});
