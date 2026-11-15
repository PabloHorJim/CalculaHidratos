/** Packaged-food lookup in Open Food Facts (a free, public database). Only the barcode is sent. */

export interface PackagedFood {
    barcode: string;
    name: string;
    carbsPer100g: number;
    fatPer100g?: number;
    proteinPer100g?: number;
}

export const isBarcode = (text: string) => /^\d{8,14}$/.test(text.trim());

const amount = (value: unknown): number | undefined => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : undefined;
};

/** Turns an Open Food Facts answer into an ingredient, or null when it has no usable carbohydrate value. */
export function parseOpenFoodFacts(barcode: string, body: unknown): PackagedFood | null {
    const data = body as { status?: number; product?: Record<string, unknown> } | null;
    const product = data?.product;
    if (!product || data?.status === 0) return null;
    const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
    const carbs = amount(nutriments.carbohydrates_100g);
    if (carbs === undefined) return null;
    const baseName = String(product.product_name_es || product.product_name || '').trim();
    const brand = String(product.brands || '').split(',')[0].trim();
    const name = [baseName, brand && !baseName.toLowerCase().includes(brand.toLowerCase()) ? `(${brand})` : '']
        .filter(Boolean).join(' ').slice(0, 80) || `Producto ${barcode}`;
    const fat = amount(nutriments.fat_100g);
    const protein = amount(nutriments.proteins_100g);
    return {
        barcode, name, carbsPer100g: carbs,
        ...(fat !== undefined ? { fatPer100g: fat } : {}),
        ...(protein !== undefined ? { proteinPer100g: protein } : {})
    };
}

export async function lookupBarcode(barcode: string, fetchImpl: typeof fetch = fetch): Promise<PackagedFood | null> {
    const code = barcode.trim();
    if (!isBarcode(code)) return null;
    const response = await fetchImpl(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_es,brands,nutriments`
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Open Food Facts respondió ${response.status}`);
    return parseOpenFoodFacts(code, await response.json());
}
