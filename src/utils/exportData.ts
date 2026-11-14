import { MealHistoryEntry } from '../types';

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function mealsToCsv(meals: MealHistoryEntry[]): string {
    const headers = ['Fecha', 'Receta', 'HC Totales', 'Peso Neto', 'Persona', 'Peso Ración', 'HC Ración', 'Diabético'];
    const rows = meals.flatMap(entry => {
        const common = [entry.timestamp, entry.recipeName, entry.totalCarbs.toFixed(1), entry.netWeight.toFixed(0)];
        // Batch / not-yet-split meals have no portions but must still be exported
        const portions = entry.portions.length > 0 ? entry.portions : [null];
        return portions.map(p => [
            ...common,
            p ? p.memberName : '',
            p ? p.weight.toFixed(0) : '',
            p ? p.carbs.toFixed(1) : '',
            p ? (p.isDiabetic ? 'Sí' : 'No') : ''
        ].map(csvCell).join(','));
    });
    // BOM so Excel opens it as UTF-8
    return '﻿' + headers.join(',') + '\n' + rows.join('\n');
}

export function downloadFile(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
