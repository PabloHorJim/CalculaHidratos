/**
 * Carbohydrate arithmetic shared by the app and the Alexa endpoint.
 * Lives under api/ (and has no imports) so the serverless functions can load it as is;
 * the app re-exports it from src/utils/nutrition.ts.
 */

/** Optional data about an ingredient, on top of its carbohydrates per 100 g. */
export interface IngredientExtra {
    /** Grams of one piece ("1 plátano ≈ 120 g"). */
    unitWeight?: number;
    /** Name of the piece: "plátano", "rebanada"... */
    unitName?: string;
    /** Cooked weight divided by raw weight (pasta ≈ 2.3: 100 g raw become 230 g cooked). */
    cookedFactor?: number;
    fatPer100g?: number;
    proteinPer100g?: number;
}

export interface IngredientLike extends IngredientExtra {
    id: string;
    name: string;
    carbsPer100g: number;
}

export interface WeighedIngredient {
    ingredientId: string;
    weight: number;
    /** The weight was taken after cooking (only meaningful when the ingredient has a cookedFactor). */
    cooked?: boolean;
}

/**
 * Typical values for the built-in list (keyed by ingredient id). They are approximations
 * the family can correct from the ingredients screen; the built-in carbohydrate values
 * refer to the raw (dry) food.
 */
export const DEFAULT_EXTRAS: Record<string, IngredientExtra> = {
    // raw -> cooked
    '1': { cookedFactor: 2.5 },   // arroz
    '12': { cookedFactor: 2.3 },  // pasta
    '89': { cookedFactor: 2.4 },  // alubias
    '90': { cookedFactor: 2.2 },  // garbanzos
    '91': { cookedFactor: 2.5 },  // lentejas
    '92': { cookedFactor: 2.3 },  // soja
    // pieces
    '4': { unitWeight: 6, unitName: 'galleta' },
    '6': { unitWeight: 30, unitName: 'magdalena' },
    '11': { unitWeight: 30, unitName: 'rebanada' },
    '13': { unitWeight: 125, unitName: 'cuajada' },
    '14': { unitWeight: 100, unitName: 'flan' },
    '22': { unitWeight: 125, unitName: 'natillas' },
    '28': { unitWeight: 125, unitName: 'yogur' },
    '29': { unitWeight: 60, unitName: 'huevo' },
    '77': { unitWeight: 150, unitName: 'patata' },
    '87': { unitWeight: 120, unitName: 'tomate' },
    '88': { unitWeight: 70, unitName: 'zanahoria' },
    '94': { unitWeight: 45, unitName: 'albaricoque' },
    '98': { unitWeight: 60, unitName: 'ciruela' },
    '104': { unitWeight: 50, unitName: 'higo' },
    '105': { unitWeight: 75, unitName: 'kiwi' },
    '107': { unitWeight: 80, unitName: 'mandarina' },
    '108': { unitWeight: 180, unitName: 'manzana' },
    '109': { unitWeight: 150, unitName: 'melocotón' },
    '114': { unitWeight: 200, unitName: 'naranja' },
    '116': { unitWeight: 170, unitName: 'pera' },
    '118': { unitWeight: 120, unitName: 'plátano' },
    '126': { unitWeight: 8, unitName: 'dátil' }
};

const positive = (value: unknown): number | undefined => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Keeps only valid values, so bad synced data can never produce NaN or a division by zero. */
export function cleanExtra(raw: unknown): IngredientExtra {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: IngredientExtra = {};
    const unitWeight = positive(data.unitWeight);
    if (unitWeight) out.unitWeight = unitWeight;
    if (typeof data.unitName === 'string' && data.unitName.trim()) out.unitName = data.unitName.trim().slice(0, 30);
    const cookedFactor = positive(data.cookedFactor);
    if (cookedFactor && cookedFactor >= 0.2 && cookedFactor <= 10) out.cookedFactor = cookedFactor;
    for (const key of ['fatPer100g', 'proteinPer100g'] as const) {
        const n = Number(data[key]);
        if (data[key] !== undefined && data[key] !== null && data[key] !== '' && Number.isFinite(n) && n >= 0 && n <= 100) out[key] = n;
    }
    return out;
}

/** Ingredient with its extras: built-in defaults, then what the family has set. */
export function withExtras<T extends IngredientLike>(ingredient: T, overrides?: Record<string, unknown>): T {
    const override = overrides?.[ingredient.id] as Record<string, unknown> | undefined;
    const base = DEFAULT_EXTRAS[ingredient.id];
    if (!base && !override) return ingredient;
    // Invalid values in an override are ignored (the default stays); an explicit 0 switches a default off
    const valid: Record<string, unknown> = { ...cleanExtra(override) };
    for (const key of ['unitWeight', 'cookedFactor']) if (override?.[key] === 0) valid[key] = 0;
    const merged: Record<string, unknown> = { ...base, ...cleanExtra(ingredient), ...valid };
    const result: Record<string, unknown> = { ...(ingredient as object), ...merged };
    for (const key of ['unitWeight', 'cookedFactor']) if (merged[key] === 0) delete result[key];
    return result as unknown as T;
}

/** Grams of the raw ingredient that a weighed amount corresponds to. */
export function rawWeight(ingredient: IngredientExtra | undefined, item: { weight: number; cooked?: boolean }): number {
    const weight = Number(item.weight) || 0;
    const factor = ingredient?.cookedFactor;
    return item.cooked && factor && factor > 0 ? weight / factor : weight;
}

export function ingredientCarbs(ingredient: IngredientLike | undefined, item: { weight: number; cooked?: boolean }): number {
    if (!ingredient) return 0;
    return (Number(ingredient.carbsPer100g) || 0) * rawWeight(ingredient, item) / 100;
}

export interface Macros { carbs: number; fat: number; protein: number; /** false when some ingredient with weight has no fat/protein data */ complete: boolean }

/** Totals of a list of weighed ingredients. Unknown ingredients count as zero. */
export function recipeMacros(items: WeighedIngredient[], find: (id: string) => IngredientLike | undefined): Macros {
    const total: Macros = { carbs: 0, fat: 0, protein: 0, complete: items.length > 0 };
    for (const item of items) {
        const ingredient = find(item.ingredientId);
        if (!ingredient) continue;
        const grams = rawWeight(ingredient, item);
        total.carbs += (Number(ingredient.carbsPer100g) || 0) * grams / 100;
        if (ingredient.fatPer100g === undefined || ingredient.proteinPer100g === undefined) {
            if (grams > 0) total.complete = false;
        } else {
            total.fat += ingredient.fatPer100g * grams / 100;
            total.protein += ingredient.proteinPer100g * grams / 100;
        }
    }
    return total;
}

/** Multiplies every weight by `factor`, rounded to the gram ("for 6 instead of 4" = 1.5). */
export function scaleIngredients<T extends { weight: number }>(items: T[], factor: number): T[] {
    if (!Number.isFinite(factor) || factor <= 0) return items;
    return items.map(item => ({ ...item, weight: Math.max(0, Math.round((Number(item.weight) || 0) * factor)) }));
}

/** "2 plátanos", "1,5 rebanadas": how many pieces a weight is, or null without a piece weight. */
export function piecesOf(ingredient: IngredientExtra | undefined, weight: number): number | null {
    if (!ingredient?.unitWeight) return null;
    return Math.round((weight / ingredient.unitWeight) * 10) / 10;
}
