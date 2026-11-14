export type SetAsideMode = 'none' | 'percentage' | 'absolute';

export interface SplitInput {
    /** Weight read on the scale (food + cookware). */
    totalWeight: number | '';
    /** Mass of the selected cookware, or null when none has been chosen yet. */
    cookwareMass: number | null;
    setAsideMode: SetAsideMode;
    setAsideValue: number | '';
    /** Carbohydrates of the whole recipe. */
    totalCarbs: number;
    /** Sum of the raw ingredient weights; fallback when the cooked food has not been weighed. */
    rawIngredientWeight?: number;
}

export interface SplitResult {
    /** Cooked food without cookware. */
    netWeightRaw: number;
    setAsideWeight: number;
    /** Food that is actually shared out. */
    netWeight: number;
    /** Fraction (0..1) of the recipe that is shared out. */
    servedFraction: number;
    /** Carbohydrates in the food that is shared out. */
    adjustedCarbs: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Single source of truth for the "reparto" maths, used by both the recipe and split tabs. */
export function computeSplit(input: SplitInput): SplitResult {
    const { totalWeight, cookwareMass, setAsideMode, totalCarbs } = input;
    const netWeightRaw = typeof totalWeight === 'number' && cookwareMass !== null
        ? Math.max(0, totalWeight - cookwareMass)
        : 0;
    const amount = typeof input.setAsideValue === 'number' && input.setAsideValue > 0 ? input.setAsideValue : 0;

    let servedFraction = 1;
    if (setAsideMode === 'percentage') {
        servedFraction = clamp01(1 - amount / 100);
    } else if (setAsideMode === 'absolute' && amount > 0) {
        // Grams set aside are grams of cooked food, so compare against the cooked weight
        // whenever it is known; raw ingredient weight is only a rough fallback.
        const reference = netWeightRaw > 0 ? netWeightRaw : (input.rawIngredientWeight ?? 0);
        servedFraction = reference > 0 ? clamp01(1 - amount / reference) : 1;
    }

    const netWeight = netWeightRaw * servedFraction;
    return {
        netWeightRaw,
        setAsideWeight: netWeightRaw - netWeight,
        netWeight,
        servedFraction,
        adjustedCarbs: totalCarbs * servedFraction
    };
}

export interface MemberShare { proportion: number; isActive: boolean }

/** Fraction of the shared food that corresponds to one member (0 when inactive). */
export function memberFraction(member: MemberShare, family: MemberShare[]): number {
    if (!member.isActive) return 0;
    const sum = family.filter(m => m.isActive).reduce((acc, m) => acc + (Number(m.proportion) || 0), 0);
    return sum > 0 ? (Number(member.proportion) || 0) / sum : 0;
}
