/**
 * Bolus (rapid insulin) arithmetic for patient mode. Pure functions, no UI.
 *
 * Conventions (the usual ones in Spain):
 *   ratio  = units of insulin per 10 g of carbohydrate (per "ración")
 *   isf    = mg/dL that one unit lowers blood glucose (factor de sensibilidad)
 *   glucose values in mg/dL
 */

export interface TimeProfile {
    /** Start of the period, "HH:mm". It applies until the next profile starts. */
    time: string;
    ratio: number;
    isf: number;
}

export interface PatientSettings {
    enabled: boolean;
    /** Which family member this user is (to pick their share of each meal). */
    memberId: string | null;
    profiles: TimeProfile[];
    targetBg: number;
    /** Below this value no bolus is suggested: treat the low first. */
    hypoThreshold: number;
    /** Duration of insulin action, in hours (used to estimate insulin on board). */
    dia: number;
    /** Dose step of the pen or pump: 0.1, 0.5 or 1 unit. */
    precision: number;
    /** Safety limit: a suggestion is never above this. */
    maxBolus: number;
    /** Percentage subtracted from the dose when "exercise" is ticked. */
    exerciseReduction: number;
    /** Percentage added to the dose when "illness" is ticked. */
    illnessIncrease: number;
}

export interface BolusRecord {
    id: string;
    timestamp: string;
    mealId: string | null;
    mealName: string;
    carbs: number;
    glucose: number | null;
    iob: number;
    suggestedDose: number;
    administeredDose: number;
}

export const DEFAULT_PATIENT_SETTINGS: PatientSettings = {
    enabled: false,
    memberId: null,
    // Placeholder values: they MUST be replaced with the ones prescribed by the care team
    profiles: [{ time: '00:00', ratio: 1, isf: 50 }],
    targetBg: 110,
    hypoThreshold: 70,
    dia: 4,
    precision: 0.5,
    maxBolus: 15,
    exerciseReduction: 30,
    illnessIncrease: 20
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Fills in missing or invalid values (old data, partial sync) with safe defaults. */
export function normalizeSettings(raw: unknown): PatientSettings {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_PATIENT_SETTINGS;
    const profiles = (Array.isArray(data.profiles) ? data.profiles : [])
        .map(p => p as Partial<TimeProfile>)
        .filter(p => typeof p?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))
        .map(p => ({ time: p.time as string, ratio: num(p.ratio, 1, 0, 20), isf: num(p.isf, 50, 1, 500) }))
        .sort((a, b) => a.time.localeCompare(b.time));
    return {
        enabled: data.enabled === true,
        memberId: typeof data.memberId === 'string' ? data.memberId : null,
        profiles: profiles.length > 0 ? profiles : d.profiles,
        targetBg: num(data.targetBg, d.targetBg, 70, 250),
        hypoThreshold: num(data.hypoThreshold, d.hypoThreshold, 50, 100),
        dia: num(data.dia, d.dia, 2, 8),
        precision: [0.1, 0.5, 1].includes(Number(data.precision)) ? Number(data.precision) : d.precision,
        maxBolus: num(data.maxBolus, d.maxBolus, 1, 50),
        exerciseReduction: num(data.exerciseReduction, d.exerciseReduction, 0, 90),
        illnessIncrease: num(data.illnessIncrease, d.illnessIncrease, 0, 100)
    };
}

const minutesOf = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

/** The profile in force at a given moment (the last one that started; wraps past midnight). */
export function activeProfile(profiles: TimeProfile[], at: Date): TimeProfile | null {
    if (profiles.length === 0) return null;
    const sorted = [...profiles].sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
    const now = at.getHours() * 60 + at.getMinutes();
    let current = sorted[sorted.length - 1]; // before the first start: yesterday's last profile
    for (const p of sorted) {
        if (minutesOf(p.time) <= now) current = p;
    }
    return current;
}

/**
 * Rough estimate of the insulin still active from earlier doses: each dose is assumed to
 * wear off in a straight line over the duration of insulin action.
 */
export function estimateIob(history: Pick<BolusRecord, 'timestamp' | 'administeredDose'>[], now: number, diaHours: number): number {
    const diaMs = diaHours * 3600 * 1000;
    const total = history.reduce((sum, record) => {
        const elapsed = now - new Date(record.timestamp).getTime();
        if (!(elapsed >= 0) || elapsed >= diaMs) return sum;
        return sum + record.administeredDose * (1 - elapsed / diaMs);
    }, 0);
    return Math.round(total * 100) / 100;
}

export type BolusWarning = 'hypo' | 'belowTarget' | 'capped' | 'noProfile';

export interface BolusInput {
    carbs: number;
    /** Current blood glucose, or null when it has not been measured. */
    glucose: number | null;
    /** Insulin on board. */
    iob: number;
    profile: TimeProfile | null;
    settings: PatientSettings;
    exercise: boolean;
    illness: boolean;
}

export interface BolusResult {
    /** Insulin for the carbohydrates. */
    foodDose: number;
    /** Insulin to correct the current glucose (negative when below target). */
    correctionDose: number;
    /** Part of the correction not given because that insulin is already on board. */
    iobDeducted: number;
    /** Multiplier from exercise / illness. */
    factor: number;
    /** Suggested dose, rounded to the pen/pump step. */
    dose: number;
    warnings: BolusWarning[];
}

const roundToStep = (value: number, step: number) => {
    const rounded = Math.round(value / step) * step;
    return Number(rounded.toFixed(step < 1 ? 1 : 0));
};

/**
 * dose = carbs / 10 × ratio  +  correction, where
 *   correction = (glucose − target) / isf
 * - Above target: insulin on board is subtracted from the correction (never from the food part).
 * - Below target: the negative correction lowers the dose.
 * - Exercise / illness scale the result; it is never negative, never above the safety limit.
 * - Below the hypoglycaemia threshold no insulin is suggested at all.
 */
export function computeBolus(input: BolusInput): BolusResult {
    const { settings, profile } = input;
    const warnings: BolusWarning[] = [];
    if (!profile || !(profile.isf > 0)) {
        return { foodDose: 0, correctionDose: 0, iobDeducted: 0, factor: 1, dose: 0, warnings: ['noProfile'] };
    }

    const carbs = Math.max(0, input.carbs || 0);
    const iob = Math.max(0, input.iob || 0);
    const foodDose = (carbs / 10) * profile.ratio;

    let correctionDose = 0;
    let iobDeducted = 0;
    if (input.glucose !== null && input.glucose > 0) {
        correctionDose = (input.glucose - settings.targetBg) / profile.isf;
        if (correctionDose > 0) {
            iobDeducted = Math.min(correctionDose, iob);
        } else if (correctionDose < 0) {
            warnings.push('belowTarget');
        }
    }

    let factor = 1;
    if (input.exercise) factor *= 1 - settings.exerciseReduction / 100;
    if (input.illness) factor *= 1 + settings.illnessIncrease / 100;

    let raw = Math.max(0, (foodDose + correctionDose - iobDeducted) * factor);

    if (input.glucose !== null && input.glucose > 0 && input.glucose < settings.hypoThreshold) {
        warnings.push('hypo');
        raw = 0;
    }
    if (raw > settings.maxBolus) {
        warnings.push('capped');
        raw = settings.maxBolus;
    }

    return { foodDose, correctionDose, iobDeducted, factor, dose: roundToStep(raw, settings.precision), warnings };
}
