export interface VoiceCommandResult {
    rawText: string;
    action: string | null;
    amount: number | null;
    ingredientName: string | null;
}

const NUMBER_WORDS: [RegExp, string][] = [
    [/\bun cuarto de kilo\b/g, '250'],
    [/\bmedio kilo\b/g, '500'],
    [/\bmedio litro\b/g, '500'],
    [/\bun kilo\b/g, '1000'],
    [/\bun litro\b/g, '1000'],
    [/\bcien\b/g, '100'],
    [/\bdoscientos\b/g, '200'],
    [/\btrescientos\b/g, '300'],
    [/\bcuatrocientos\b/g, '400'],
    [/\bquinientos\b/g, '500'],
];

/** Lightweight parser for phrases like "añade 150 gramos de arroz". */
export function parseVoiceCommand(text: string): VoiceCommandResult {
    let normalized = text.toLowerCase().trim().replace(/[.,;!?¿¡]+$/g, '');
    for (const [pattern, value] of NUMBER_WORDS) normalized = normalized.replace(pattern, value);

    // [action] <amount> [unit] [de] <ingredient>
    // The unit must be a whole word, otherwise "200 garbanzos" would lose its "g".
    const full = normalized.match(
        /^(añadir|añade|pon|poner|suma|sumar)?\s*(\d+(?:[.,]\d+)?)\s*(?:(?:gramos|gramo|grs|gr|g|mililitros|mililitro|ml)\b\.?)?\s*(?:de\s+)?(.+)$/i
    );
    if (full && full[3].trim()) {
        return {
            rawText: text,
            action: full[1] || 'añadir',
            amount: parseFloat(full[2].replace(',', '.')),
            ingredientName: full[3].trim()
        };
    }

    const simple = normalized.match(/^(añadir|añade|pon|poner|busca|buscar)?\s*(.+)$/i);
    if (simple && simple[2]) {
        return { rawText: text, action: simple[1] || null, amount: null, ingredientName: simple[2].trim() };
    }
    return { rawText: text, action: null, amount: null, ingredientName: text };
}
