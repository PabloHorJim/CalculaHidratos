import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeProfile, computeBolus, estimateIob, normalizeSettings, DEFAULT_PATIENT_SETTINGS, PatientSettings, TimeProfile } from './bolus';

const settings: PatientSettings = { ...DEFAULT_PATIENT_SETTINGS, targetBg: 100, precision: 0.5, maxBolus: 15, exerciseReduction: 30, illnessIncrease: 20 };
const profile: TimeProfile = { time: '00:00', ratio: 1, isf: 50 };
const calc = (over: Partial<Parameters<typeof computeBolus>[0]>) =>
    computeBolus({ carbs: 0, glucose: null, iob: 0, profile, settings, exercise: false, illness: false, ...over });

test('food only: carbs / 10 × ratio', () => {
    assert.equal(calc({ carbs: 60 }).dose, 6);
    assert.equal(calc({ carbs: 45, profile: { ...profile, ratio: 1.2 } }).dose, 5.5); // 5.4 → nearest 0.5
    assert.equal(calc({ carbs: 0 }).dose, 0);
});

test('correction above target is added', () => {
    const r = calc({ carbs: 60, glucose: 200 });
    assert.equal(r.correctionDose, 2);
    assert.equal(r.dose, 8);
});

test('insulin on board reduces the correction but never the food dose', () => {
    assert.equal(calc({ carbs: 60, glucose: 200, iob: 1 }).dose, 7);
    assert.equal(calc({ carbs: 60, glucose: 200, iob: 5 }).dose, 6);
    assert.equal(calc({ carbs: 60, glucose: null, iob: 5 }).dose, 6);
});

test('glucose below target lowers the dose', () => {
    const r = calc({ carbs: 60, glucose: 75 });
    assert.equal(r.correctionDose, -0.5);
    assert.equal(r.dose, 5.5);
    assert.ok(r.warnings.includes('belowTarget'));
    assert.equal(calc({ carbs: 5, glucose: 75 }).dose, 0); // never negative
});

test('hypoglycaemia: no insulin suggested', () => {
    const r = calc({ carbs: 80, glucose: 60 });
    assert.equal(r.dose, 0);
    assert.ok(r.warnings.includes('hypo'));
});

test('exercise and illness modifiers are applied to the dose', () => {
    assert.equal(calc({ carbs: 100, exercise: true }).dose, 7);
    assert.equal(calc({ carbs: 100, illness: true }).dose, 12);
    assert.equal(calc({ carbs: 100, exercise: true, illness: true }).dose, 8.5); // 10 × 0.7 × 1.2 = 8.4
});

test('safety limit and pen step', () => {
    const capped = calc({ carbs: 300 });
    assert.equal(capped.dose, 15);
    assert.ok(capped.warnings.includes('capped'));
    assert.equal(calc({ carbs: 33, settings: { ...settings, precision: 0.1 } }).dose, 3.3);
    assert.equal(calc({ carbs: 33, settings: { ...settings, precision: 1 } }).dose, 3);
});

test('without a usable profile nothing is suggested', () => {
    const r = calc({ carbs: 60, profile: null });
    assert.equal(r.dose, 0);
    assert.deepEqual(r.warnings, ['noProfile']);
});

test('activeProfile picks the last profile that started, wrapping past midnight', () => {
    const profiles = [{ time: '07:00', ratio: 1.5, isf: 40 }, { time: '13:00', ratio: 1, isf: 50 }, { time: '21:00', ratio: 1.2, isf: 45 }];
    const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);
    assert.equal(activeProfile(profiles, at(8))?.ratio, 1.5);
    assert.equal(activeProfile(profiles, at(13))?.ratio, 1);
    assert.equal(activeProfile(profiles, at(23, 59))?.ratio, 1.2);
    assert.equal(activeProfile(profiles, at(3))?.ratio, 1.2);
    assert.equal(activeProfile([], at(3)), null);
});

test('estimateIob decays linearly over the duration of action', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    const ago = (h: number) => new Date(now - h * 3600000).toISOString();
    assert.equal(estimateIob([{ timestamp: ago(2), administeredDose: 4 }], now, 4), 2);
    assert.equal(estimateIob([{ timestamp: ago(1), administeredDose: 4 }, { timestamp: ago(5), administeredDose: 10 }], now, 4), 3);
    assert.equal(estimateIob([{ timestamp: ago(-1), administeredDose: 4 }], now, 4), 0); // future record ignored
});

test('normalizeSettings repairs invalid data', () => {
    const s = normalizeSettings({ enabled: true, targetBg: 'x', precision: 0.3, maxBolus: 500, profiles: [{ time: '25:00', ratio: 1, isf: 50 }, { time: '08:00', ratio: -1, isf: 0 }] });
    assert.equal(s.enabled, true);
    assert.equal(s.targetBg, DEFAULT_PATIENT_SETTINGS.targetBg);
    assert.equal(s.precision, 0.5);
    assert.equal(s.maxBolus, DEFAULT_PATIENT_SETTINGS.maxBolus);
    assert.deepEqual(s.profiles, [{ time: '08:00', ratio: 1, isf: 50 }]);
    assert.deepEqual(normalizeSettings(null), DEFAULT_PATIENT_SETTINGS);
});
