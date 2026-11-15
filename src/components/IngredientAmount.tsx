import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Ingredient } from '../types';
import { piecesOf } from '../utils/nutrition';

interface Props {
    ingredient: Ingredient;
    weight: number;
    cooked: boolean;
    onWeight: (grams: number) => void;
    onCooked: (cooked: boolean) => void;
    className?: string;
}

const formatPieces = (n: number) => String(n).replace('.', ',');

/**
 * Extra ways of saying "how much" for an ingredient row: by pieces ("2 plátanos") when the
 * ingredient has a piece weight, and raw/cooked when it has a raw->cooked factor.
 * Renders nothing for plain ingredients.
 */
export function IngredientAmount({ ingredient, weight, cooked, onWeight, onCooked, className = '' }: Props) {
    const pieces = piecesOf(ingredient, weight);
    const unit = ingredient.unitWeight;
    const factor = ingredient.cookedFactor;
    if (!unit && !factor) return null;

    const step = (delta: number) => {
        if (!unit) return;
        // Snap to whole pieces: 1,3 -> 2 when adding, 1,3 -> 1 when removing
        const current = weight / unit;
        const next = delta > 0 ? Math.floor(current + 1e-9) + 1 : Math.ceil(current - 1e-9) - 1;
        onWeight(Math.max(0, Math.round(next * unit)));
    };
    const pill = 'h-8 min-w-8 px-2 rounded-lg text-xs font-bold flex items-center justify-center border transition-colors';

    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`}>
            {unit && pieces !== null && (
                <div className="flex items-center gap-1" role="group" aria-label={`Unidades de ${ingredient.name}`}>
                    <button type="button" onClick={() => step(-1)} aria-label="Quitar una unidad"
                        className={`${pill} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300`}>
                        <Minus size={14} />
                    </button>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 min-w-16 text-center">
                        {formatPieces(pieces)} {ingredient.unitName || 'ud'}
                    </span>
                    <button type="button" onClick={() => step(1)} aria-label="Añadir una unidad"
                        className={`${pill} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300`}>
                        <Plus size={14} />
                    </button>
                    <span className="text-[0.6875rem] text-gray-500 dark:text-gray-400">≈ {unit} g/ud</span>
                </div>
            )}
            {factor && (
                <div className="flex items-center gap-1" role="group" aria-label={`Peso de ${ingredient.name} en crudo o cocido`}>
                    <button type="button" onClick={() => onCooked(false)} aria-pressed={!cooked}
                        className={`${pill} ${!cooked ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}>
                        Crudo
                    </button>
                    <button type="button" onClick={() => onCooked(true)} aria-pressed={cooked}
                        className={`${pill} ${cooked ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}>
                        Cocido
                    </button>
                    {cooked && (
                        <span className="text-[0.6875rem] text-gray-500 dark:text-gray-400">
                            ≈ {Math.round(weight / factor)} g en crudo (÷{String(factor).replace('.', ',')})
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
