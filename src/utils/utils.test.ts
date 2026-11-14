import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon, merge3, toPlain } from '../sync/merge';
import { computeSplit, memberFraction } from './split';
import { upsertHistory, sortHistory, localDateKey, HISTORY_LIMIT } from './history';
import { parseVoiceCommand } from './voice';
import type { MealHistoryEntry } from '../types';

// ---------- sync ----------
test('canon ignores key order and undefined', () => {
    assert.equal(canon({ b: 1, a: undefined, c: [{ y: 1, x: 2 }] }), canon({ c: [{ x: 2, y: 1 }], b: 1 }));
    assert.equal(canon(undefined), 'null');
});

test('toPlain strips undefined (Firestore rejects it)', () => {
    assert.deepEqual(toPlain({ a: 1, b: undefined, c: [{ d: undefined, e: 2 }] }), { a: 1, c: [{ e: 2 }] });
});

test('merge3: only one side changed', () => {
    const base = [{ id: '1', n: 'a' }];
    const changed = [{ id: '1', n: 'b' }];
    assert.deepEqual(merge3(base, base, changed, 'id'), changed);
    assert.deepEqual(merge3(base, changed, base, 'id'), changed);
});

test('merge3: both devices add different meals → both are kept', () => {
    const base = [{ id: '1' }];
    const local = [{ id: '2' }, { id: '1' }];
    const remote = [{ id: '3' }, { id: '1' }];
    const ids = merge3(base, local, remote, 'id').map(r => r.id).sort();
    assert.deepEqual(ids, ['1', '2', '3']);
});

test('merge3: deletions on either side are respected, edits are kept', () => {
    const base = [{ id: '1', v: 0 }, { id: '2', v: 0 }, { id: '3', v: 0 }];
    const local = [{ id: '1', v: 9 }, { id: '3', v: 0 }];            // edited 1, deleted 2
    const remote = [{ id: '1', v: 0 }, { id: '2', v: 0 }, { id: '4', v: 0 }]; // deleted 3, added 4
    assert.deepEqual(merge3(base, local, remote, 'id'), [{ id: '1', v: 9 }, { id: '4', v: 0 }]);
});

test('merge3: same record edited on both sides → local wins; scalars → local wins', () => {
    assert.deepEqual(merge3([{ id: '1', v: 0 }], [{ id: '1', v: 1 }], [{ id: '1', v: 2 }], 'id'), [{ id: '1', v: 1 }]);
    assert.equal(merge3('a', 'b', 'c'), 'b');
    assert.equal(merge3('a', 'a', 'c'), 'c');
});

test('merge3: keyed maps (ingredient weight history)', () => {
    const merged = merge3({ a: [1] }, { a: [1], b: [2] }, { a: [1, 5], c: [3] });
    assert.deepEqual(merged, { a: [1, 5], b: [2], c: [3] });
});

// ---------- split ----------
test('split: cookware is subtracted and nothing is computed until one is chosen', () => {
    const common = { setAsideMode: 'none' as const, setAsideValue: '' as const, totalCarbs: 120 };
    assert.equal(computeSplit({ ...common, totalWeight: 2000, cookwareMass: null }).netWeight, 0);
    const r = computeSplit({ ...common, totalWeight: 2000, cookwareMass: 1200 });
    assert.equal(r.netWeight, 800);
    assert.equal(r.adjustedCarbs, 120);
    assert.equal(computeSplit({ ...common, totalWeight: 500, cookwareMass: 1200 }).netWeight, 0);
});

test('split: set aside by percentage and by grams of cooked food', () => {
    const pct = computeSplit({ totalWeight: 1000, cookwareMass: 0, setAsideMode: 'percentage', setAsideValue: 25, totalCarbs: 100 });
    assert.equal(pct.netWeight, 750);
    assert.equal(pct.adjustedCarbs, 75);
    const abs = computeSplit({ totalWeight: 1000, cookwareMass: 0, setAsideMode: 'absolute', setAsideValue: 250, totalCarbs: 100, rawIngredientWeight: 200 });
    assert.equal(abs.netWeight, 750);
    assert.equal(abs.adjustedCarbs, 75); // cooked weight is used, not the 200 g of raw rice
});

test('split: carbs never go negative', () => {
    const over = computeSplit({ totalWeight: '', cookwareMass: null, setAsideMode: 'absolute', setAsideValue: 250, totalCarbs: 100, rawIngredientWeight: 200 });
    assert.equal(over.adjustedCarbs, 0);
    const pct = computeSplit({ totalWeight: 1000, cookwareMass: 0, setAsideMode: 'percentage', setAsideValue: 150, totalCarbs: 100 });
    assert.equal(pct.adjustedCarbs, 0);
    assert.equal(pct.netWeight, 0);
});

test('memberFraction only counts active members', () => {
    const family = [
        { proportion: 0.25, isActive: true },
        { proportion: 0.25, isActive: true },
        { proportion: 0.5, isActive: false }
    ];
    assert.equal(memberFraction(family[0], family), 0.5);
    assert.equal(memberFraction(family[2], family), 0);
    assert.equal(memberFraction({ proportion: 1, isActive: true }, []), 0);
});

// ---------- history ----------
const entry = (id: string, name: string, minutesAgo: number, now: number, extra: Partial<MealHistoryEntry> = {}): MealHistoryEntry => ({
    id, recipeName: name, timestamp: new Date(now - minutesAgo * 60000).toISOString(), totalCarbs: 50, netWeight: 500, portions: [], ...extra
});

test('history: same recipe within two hours is updated, otherwise added', () => {
    const now = Date.parse('2026-11-14T14:00:00Z');
    const portions = [{ memberId: '1', memberName: 'Ana', weight: 200, carbs: 20, isDiabetic: true }];
    const list = [entry('a', 'Lentejas', 30, now, { portions }), entry('b', 'Lentejas', 60 * 26, now)];

    const prelim = upsertHistory(list, { recipeName: 'Lentejas', totalCarbs: 80 }, now);
    assert.equal(prelim.length, 2);
    assert.equal(prelim[0].id, 'a');
    assert.equal(prelim[0].totalCarbs, 80);
    assert.deepEqual(prelim[0].portions, portions); // re-saving the recipe keeps the split

    const other = upsertHistory(list, { recipeName: 'Paella', totalCarbs: 10, netWeight: 1, portions: [] }, now);
    assert.equal(other.length, 3);
    assert.equal(other[0].recipeName, 'Paella');
});

test('history: batch entries have no portions and no undefined fields', () => {
    const now = Date.now();
    const portions = [{ memberName: 'Ana', weight: 1, carbs: 1, isDiabetic: true }];
    const batch = upsertHistory([], { recipeName: 'Tarta', totalCarbs: 300, netWeight: 900, portions, isBatch: true }, now)[0];
    assert.equal(batch.isBatch, true);
    assert.deepEqual(batch.portions, []);
    const normal = upsertHistory([], { recipeName: 'Sopa', totalCarbs: 30, netWeight: 900, portions, isBatch: false }, now)[0];
    assert.ok(!('isBatch' in normal));
});

test('history: sorted newest first and capped', () => {
    const now = Date.now();
    const many = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => entry(String(i), `r${i}`, i, now));
    const sorted = sortHistory([...many].reverse());
    assert.equal(sorted.length, HISTORY_LIMIT);
    assert.equal(sorted[0].id, '0');
});

test('localDateKey uses the local calendar day', () => {
    assert.equal(localDateKey(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
    assert.equal(localDateKey(new Date(2026, 10, 14, 23, 59)), '2026-11-14');
});

// ---------- voice ----------
test('voice: amount, unit and ingredient', () => {
    assert.deepEqual(
        (({ amount, ingredientName }) => ({ amount, ingredientName }))(parseVoiceCommand('Añade 150 gramos de arroz')),
        { amount: 150, ingredientName: 'arroz' }
    );
    assert.equal(parseVoiceCommand('150 gr de pan').ingredientName, 'pan');
    assert.equal(parseVoiceCommand('pon medio kilo de patata').amount, 500);
});

test('voice: ingredients starting with "g" keep their first letter', () => {
    const r = parseVoiceCommand('200 garbanzos');
    assert.equal(r.amount, 200);
    assert.equal(r.ingredientName, 'garbanzos');
    assert.equal(parseVoiceCommand('añade 100 g de gambas').ingredientName, 'gambas');
});

test('voice: no amount', () => {
    const r = parseVoiceCommand('añadir cebolla');
    assert.equal(r.amount, null);
    assert.equal(r.ingredientName, 'cebolla');
});
