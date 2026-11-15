/**
 * Security rules tests. They run against the Firestore emulator:
 *   npm run test:rules
 * Every write uses the same shape the app sends (see useSession.ts and the sync hooks).
 */
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, deleteField, collection, getDocs, query, orderBy, limit, where, runTransaction, writeBatch, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;
const instances = new Map<string, Db>();
// One Firestore instance per user: references from different instances cannot be mixed
const db = (uid: string): Db => {
    if (!instances.has(uid)) instances.set(uid, env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore());
    return instances.get(uid)!;
};
const profile = (uid: string, groupId: string | null = null) => ({ uid, email: `${uid}@example.com`, displayName: uid, photoURL: null, groupId });
const meal = (id: string) => ({ id, timestamp: '2026-11-14T12:00:00.000Z', recipeName: 'Paella', totalCarbs: 120, netWeight: 800, portions: [] });
const GROUP = 'ABCD2345';
const group = (extra: Record<string, unknown> = {}) => ({
    id: GROUP, name: 'Familia', adminUid: 'ana', inviteCode: GROUP,
    memberUids: ['ana'], members: { ana: { displayName: 'Ana', photoURL: null } }, blockedUids: [],
    recipes: [], family: [], cookware: [], customIngredients: [], ...extra
});
const INVITE = 'INVITE23';
const inHours = (hours: number) => Timestamp.fromMillis(Date.now() + hours * 3600 * 1000);
/** Joins the way the app does: naming the invitation in the user's own member entry. */
const join = (uid: string, groupId = GROUP, code: string | null = INVITE) => updateDoc(doc(db(uid), 'groups', groupId), {
    memberUids: arrayUnion(uid), [`members.${uid}`]: { displayName: uid, photoURL: null, ...(code ? { invite: code } : {}) }
});
const seedInvite = (code = INVITE, groupId = GROUP, hours = 24) =>
    seed(a => setDoc(doc(a, 'invites', code), { groupId, createdBy: 'ana', expiresAt: inHours(hours) }));
const seed = (write: (admin: ReturnType<typeof db>) => Promise<unknown>) =>
    env.withSecurityRulesDisabled(ctx => write(ctx.firestore() as unknown as ReturnType<typeof db>).then(() => undefined));

before(async () => {
    env = await initializeTestEnvironment({
        projectId: 'demo-carbcalc',
        firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 }
    });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

test('user documents: only the owner reads and writes', async () => {
    await assertSucceeds(setDoc(doc(db('ana'), 'users/ana'), profile('ana'), { merge: true }));
    await assertSucceeds(getDoc(doc(db('ana'), 'users/ana')));
    await assertFails(getDoc(doc(db('bob'), 'users/ana')));
    await assertFails(setDoc(doc(db('bob'), 'users/ana'), { uid: 'ana', groupId: 'X' }, { merge: true }));
    await assertFails(setDoc(doc(db('bob'), 'users/bob'), { uid: 'ana' }));
    // group mates cannot list each other's profiles any more
    await seed(a => setDoc(doc(a, 'users/bob'), profile('bob', GROUP)));
    await setDoc(doc(db('ana'), 'users/ana'), { uid: 'ana', groupId: GROUP }, { merge: true });
    await assertFails(getDocs(query(collection(db('ana'), 'users'), where('groupId', '==', GROUP))));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/ana')));
});

test('personal data, meals and private patient data: owner only', async () => {
    await setDoc(doc(db('ana'), 'users/ana'), profile('ana'));
    await assertSucceeds(runTransaction(db('ana'), async tx => {
        await tx.get(doc(db('ana'), 'users/ana'));
        tx.set(doc(db('ana'), 'users/ana'), { recipes: [{ id: '1', name: 'x', ingredients: [] }], uid: 'ana', updatedAt: 'now' }, { merge: true });
    }));
    await assertSucceeds(setDoc(doc(db('ana'), 'users/ana/meals/m1'), meal('m1')));
    await assertSucceeds(getDocs(query(collection(db('ana'), 'users/ana/meals'), orderBy('timestamp', 'desc'), limit(300))));
    await assertSucceeds(deleteDoc(doc(db('ana'), 'users/ana/meals/m1')));
    await assertFails(setDoc(doc(db('ana'), 'users/ana/meals/m1'), meal('other-id')));
    await assertFails(getDocs(collection(db('bob'), 'users/ana/meals')));
    await assertFails(setDoc(doc(db('bob'), 'users/ana/meals/m2'), meal('m2')));

    await assertSucceeds(setDoc(doc(db('ana'), 'users/ana/private/patient'), { settings: { targetBg: 100 }, bolusHistory: [] }));
    await assertSucceeds(getDoc(doc(db('ana'), 'users/ana/private/patient')));
    await assertFails(getDoc(doc(db('bob'), 'users/ana/private/patient')));
    await assertFails(setDoc(doc(db('bob'), 'users/ana/private/patient'), { settings: {} }));
});

test('creating a group: only as its admin and only member', async () => {
    await assertSucceeds(setDoc(doc(db('ana'), 'groups', GROUP), group()));
    await assertFails(setDoc(doc(db('bob'), 'groups/OTHER123'), group({ id: 'OTHER123', inviteCode: 'OTHER123' })));
    await assertFails(setDoc(doc(db('bob'), 'groups/OTHER123'), group({ id: 'OTHER123', adminUid: 'bob', memberUids: ['bob', 'ana'] })));
    await assertFails(setDoc(doc(db('bob'), 'groups', GROUP), group({ adminUid: 'bob', memberUids: ['bob'] }))); // exists: cannot take it over
});

test('invitations: members create them, they expire, and only a valid one lets a stranger in', async () => {
    await seed(a => setDoc(doc(a, 'groups', GROUP), group()));
    const invite = (uid: string, code: string, data: Record<string, unknown>) => setDoc(doc(db(uid), 'invites', code), data);
    const good = { groupId: GROUP, createdBy: 'ana', expiresAt: inHours(24) };
    await assertFails(invite('bob', 'BOBCODE23', { ...good, createdBy: 'bob' }));          // not a member
    await assertFails(invite('ana', 'ANACODE23', { ...good, createdBy: 'bob' }));          // in someone else's name
    await assertFails(invite('ana', 'ANACODE23', { ...good, expiresAt: inHours(24 * 30) })); // too long
    await assertFails(invite('ana', 'ANACODE23', { ...good, expiresAt: inHours(-1) }));
    await assertFails(invite('ana', 'short', good));
    await assertSucceeds(invite('ana', INVITE, good));
    await assertFails(getDocs(collection(db('bob'), 'invites')));                          // codes cannot be listed
    await assertSucceeds(getDoc(doc(db('bob'), 'invites', INVITE)));

    await assertFails(join('bob', GROUP, null));          // knowing the group id is not enough any more
    await assertFails(join('bob', GROUP, 'WRONGCODE'));
    await seedInvite('EXPIRED23', GROUP, -1);
    await assertFails(join('bob', GROUP, 'EXPIRED23'));
    await seed(a => setDoc(doc(a, 'groups/OTHERGROUP'), group({ id: 'OTHERGROUP' })));
    await assertFails(join('bob', 'OTHERGROUP'));         // invitation is for another group
    await assertSucceeds(join('bob'));

    await assertFails(deleteDoc(doc(db('eve'), 'invites', INVITE)));
    await assertSucceeds(deleteDoc(doc(db('bob'), 'invites', INVITE))); // any member can cancel it
    await assertFails(join('carl'));
});

test('a stranger cannot read a group; a valid invitation lets them join, then read and write data', async () => {
    await seed(a => setDoc(doc(a, 'groups', GROUP), group()));
    await seedInvite();
    await assertFails(getDoc(doc(db('bob'), 'groups', GROUP)));
    await assertFails(getDocs(collection(db('bob'), 'groups')));
    await assertFails(getDocs(collection(db('bob'), `groups/${GROUP}/meals`)));
    await assertFails(setDoc(doc(db('bob'), `groups/${GROUP}/meals/m1`), meal('m1')));
    await assertFails(join('bob', 'NOSUCHGRP'));

    await assertSucceeds(join('bob'));
    await assertSucceeds(join('bob')); // registering again is harmless
    await assertSucceeds(getDoc(doc(db('bob'), 'groups', GROUP)));
    await assertSucceeds(runTransaction(db('bob'), async tx => {
        await tx.get(doc(db('bob'), 'groups', GROUP));
        tx.set(doc(db('bob'), 'groups', GROUP), { recipes: [{ id: '1', name: 'x', ingredients: [] }], currentRecipeName: 'x', historyMigrated: true, updatedAt: 'now' }, { merge: true });
    }));
    const batch = writeBatch(db('bob'));
    batch.set(doc(db('bob'), `groups/${GROUP}/meals/m1`), meal('m1'));
    batch.set(doc(db('bob'), `groups/${GROUP}/meals/m2`), meal('m2'));
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(query(collection(db('ana'), `groups/${GROUP}/meals`), orderBy('timestamp', 'desc'), limit(300))));
    await assertSucceeds(deleteDoc(doc(db('ana'), `groups/${GROUP}/meals/m2`)));
});

test('joining cannot be used to change anything else', async () => {
    await seed(a => setDoc(doc(a, 'groups', GROUP), group()));
    await seedInvite();
    const ref = doc(db('bob'), 'groups', GROUP);
    const me = { 'members.bob': { displayName: 'bob', photoURL: null, invite: INVITE } };
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('bob'), ...me, adminUid: 'bob' }));
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('bob'), ...me, recipes: [{ id: 'x' }] }));
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('bob'), ...me, legacyJoinUntil: inHours(24) }));
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('bob', 'carl'), ...me }));
    await assertFails(updateDoc(ref, { memberUids: ['bob'], ...me })); // would drop ana
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('bob'), ...me, 'members.ana': { displayName: 'hacked' } }));
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('carl'), 'members.carl': { displayName: 'c', invite: INVITE } })); // someone else
});

test('members cannot change who belongs to the group or its identity', async () => {
    await seed(a => setDoc(doc(a, 'groups', GROUP), group()));
    await seedInvite();
    await join('bob');
    const ref = doc(db('bob'), 'groups', GROUP);
    await assertFails(updateDoc(ref, { adminUid: 'bob' }));
    await assertFails(updateDoc(ref, { inviteCode: 'NEW' }));
    await assertFails(updateDoc(ref, { memberUids: arrayRemove('ana') }));
    await assertFails(updateDoc(ref, { memberUids: arrayUnion('carl') }));
    await assertFails(updateDoc(ref, { blockedUids: arrayUnion('ana') }));
    await assertFails(updateDoc(ref, { legacyJoinUntil: inHours(24) }));
    await assertFails(updateDoc(ref, { 'members.ana': deleteField() }));
    await assertFails(updateDoc(ref, { name: '' }));
    await assertSucceeds(updateDoc(ref, { 'members.bob': { displayName: 'Bob', photoURL: null } }));
    await assertSucceeds(updateDoc(ref, { family: [{ id: '1', name: 'Bob' }] }));
});

test('leaving, and being removed by the admin', async () => {
    await seed(a => setDoc(doc(a, 'groups', GROUP), group()));
    await seedInvite();
    await join('bob');
    await join('carl');

    await assertSucceeds(updateDoc(doc(db('bob'), 'groups', GROUP), { memberUids: arrayRemove('bob'), 'members.bob': deleteField() }));
    await assertFails(getDoc(doc(db('bob'), 'groups', GROUP)));
    await assertSucceeds(join('bob')); // may come back while the invitation is valid

    await assertFails(updateDoc(doc(db('bob'), 'groups', GROUP), { memberUids: arrayRemove('carl'), blockedUids: arrayUnion('carl'), 'members.carl': deleteField() }));
    await assertSucceeds(updateDoc(doc(db('ana'), 'groups', GROUP), { memberUids: arrayRemove('carl'), blockedUids: arrayUnion('carl'), 'members.carl': deleteField() }));
    await assertFails(getDoc(doc(db('carl'), 'groups', GROUP)));
    await assertFails(getDocs(collection(db('carl'), `groups/${GROUP}/meals`)));
    await assertFails(join('carl', GROUP, null));
    await assertSucceeds(join('carl'));      // removed members come back only with an invitation
    await assertFails(updateDoc(doc(db('ana'), 'groups', GROUP), { adminUid: 'bob' }));
    await assertSucceeds(updateDoc(doc(db('ana'), 'groups', GROUP), { name: 'Los García' }));
});

test('groups created by older app versions keep working until the first updated app registers', async () => {
    const LEGACY = 'OLD123';
    await seed(async a => {
        await setDoc(doc(a, 'groups', LEGACY), { id: LEGACY, name: 'Antiguo', adminUid: 'ana', inviteCode: LEGACY, recipes: [], mealHistory: [meal('m0')] });
        await setDoc(doc(a, 'users/ana'), profile('ana', LEGACY));
        await setDoc(doc(a, 'users/bob'), profile('bob', LEGACY));
        await setDoc(doc(a, 'users/eve'), profile('eve'));
    });
    // old app: members (by profile) read and write the whole document, strangers do not
    await assertSucceeds(getDoc(doc(db('bob'), 'groups', LEGACY)));
    await assertSucceeds(setDoc(doc(db('bob'), 'groups', LEGACY), { recipes: [], mealHistory: [], groupId: LEGACY, updatedAt: 'now' }, { merge: true }));
    await assertFails(getDoc(doc(db('eve'), 'groups', LEGACY)));
    await assertFails(getDocs(collection(db('ana'), `groups/${LEGACY}/meals`))); // meals need registration first

    // updated app: registers (starting the 30-day window for the others), then uses the meals collection
    const register = (uid: string, extra: Record<string, unknown> = {}) => updateDoc(doc(db(uid), 'groups', LEGACY), {
        memberUids: arrayUnion(uid), [`members.${uid}`]: { displayName: uid, photoURL: null }, ...extra
    });
    await assertFails(register('ana', { legacyJoinUntil: inHours(24 * 60) })); // window too long
    await assertSucceeds(register('ana', { legacyJoinUntil: inHours(24 * 30) }));
    await assertSucceeds(setDoc(doc(db('ana'), `groups/${LEGACY}/meals/m0`), meal('m0')));
    // from now on the member list rules: bob (old app, not registered yet) waits for his update
    await assertFails(getDoc(doc(db('bob'), 'groups', LEGACY)));
    await assertFails(register('bob', { legacyJoinUntil: inHours(24 * 30) })); // the window is set only once
    await assertFails(register('eve'));                                        // profile does not point here
    await assertSucceeds(register('bob'));
    await assertSucceeds(getDoc(doc(db('bob'), 'groups', LEGACY)));

    // once the window is over, the old code no longer lets anyone in
    await seed(async a => {
        await updateDoc(doc(a, 'groups', LEGACY), { legacyJoinUntil: inHours(-1) });
        await setDoc(doc(a, 'users/carl'), profile('carl', LEGACY));
    });
    await assertFails(register('carl'));
});
