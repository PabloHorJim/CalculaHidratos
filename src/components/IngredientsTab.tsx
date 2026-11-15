import React, { useMemo, useState } from 'react';
import { Apple, Plus, Search, Trash2, ScanBarcode, ChevronDown } from 'lucide-react';
import { AppState } from '../hooks/useAppState';
import { INITIAL_INGREDIENTS } from '../data/ingredients';
import { getCategoryColor } from '../utils/categoryColors';
import { NumberInput } from './NumberInput';
import { BarcodeScanner, canScanBarcodes } from './BarcodeScanner';
import { lookupBarcode, isBarcode } from '../utils/openFoodFacts';
import { DEFAULT_EXTRAS } from '../utils/nutrition';
import { Ingredient } from '../types';

interface IngredientsTabProps {
    state: AppState;
}

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Pieces, raw->cooked factor, fat and protein of one ingredient. */
function ExtrasEditor({ ingredient, state }: { ingredient: Ingredient; state: AppState }) {
    const { updateIngredientExtra } = state;
    const field = 'w-full px-2 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800 dark:text-gray-100';
    const label = 'text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1';
    const isDefault = !!DEFAULT_EXTRAS[ingredient.id] && !state.ingredientExtras[ingredient.id];
    return (
        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-2">
                <label>
                    <span className={label}>Peso de 1 unidad (g)</span>
                    <NumberInput allowEmpty max={5000} placeholder="—" value={ingredient.unitWeight ?? ''} className={field}
                        onChange={(v) => updateIngredientExtra(ingredient.id, { unitWeight: v === '' ? 0 : v })} />
                </label>
                <label>
                    <span className={label}>Nombre de la unidad</span>
                    <input type="text" placeholder="unidad, rebanada…" value={ingredient.unitName ?? ''} className={field}
                        onChange={(e) => updateIngredientExtra(ingredient.id, { unitName: e.target.value })} />
                </label>
                <label className="col-span-2">
                    <span className={label}>Cocido ÷ crudo (pasta ≈ 2,3: 100 g en crudo pesan 230 g cocidos)</span>
                    <NumberInput allowEmpty max={10} placeholder="—" value={ingredient.cookedFactor ?? ''} className={field}
                        onChange={(v) => updateIngredientExtra(ingredient.id, { cookedFactor: v === '' ? 0 : v })} />
                </label>
                <label>
                    <span className={label}>Grasa /100 g</span>
                    <NumberInput allowEmpty max={100} placeholder="—" value={ingredient.fatPer100g ?? ''} className={field}
                        onChange={(v) => updateIngredientExtra(ingredient.id, { fatPer100g: v === '' ? undefined : v })} />
                </label>
                <label>
                    <span className={label}>Proteína /100 g</span>
                    <NumberInput allowEmpty max={100} placeholder="—" value={ingredient.proteinPer100g ?? ''} className={field}
                        onChange={(v) => updateIngredientExtra(ingredient.id, { proteinPer100g: v === '' ? undefined : v })} />
                </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
                {isDefault ? 'Valores típicos aproximados: ajústalos a lo que compráis. ' : ''}
                Para afinar el factor de cocción, pesa el alimento en crudo y otra vez cocido y divide.
            </p>
        </div>
    );
}

export function IngredientsTab({ state }: IngredientsTabProps) {
    const { customIngredients, recipes, ingredientById, createCustomIngredient, updateCustomIngredient, updateIngredientExtra, removeCustomIngredient, setToast } = state;
    const [expanded, setExpanded] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [barcode, setBarcode] = useState('');
    const [lookingUp, setLookingUp] = useState(false);
    const [pendingExtras, setPendingExtras] = useState<{ fatPer100g?: number; proteinPer100g?: number } | null>(null);

    const lookup = async (code: string) => {
        if (!isBarcode(code)) { setToast('Escribe los números del código de barras'); return; }
        setLookingUp(true);
        try {
            const food = await lookupBarcode(code);
            if (!food) { setToast('Producto no encontrado o sin datos de hidratos: rellénalo a mano'); return; }
            setName(food.name); setCarbs(food.carbsPer100g);
            setPendingExtras({ fatPer100g: food.fatPer100g, proteinPer100g: food.proteinPer100g });
            setBarcode('');
            setToast('Datos de Open Food Facts: compáralos con la etiqueta antes de crear');
        } catch {
            setToast('No se pudo consultar Open Food Facts. ¿Hay conexión?');
        } finally {
            setLookingUp(false);
        }
    };
    const [search, setSearch] = useState('');
    const [name, setName] = useState('');
    const [carbs, setCarbs] = useState<number | ''>('');
    const [category, setCategory] = useState('');

    const term = normalize(search.trim());
    const matches = (text: string) => !term || normalize(text).includes(term);

    const mine = useMemo(
        () => customIngredients.filter(i => matches(i.name)).sort((a, b) => a.name.localeCompare(b.name)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [customIngredients, term]
    );
    const builtIn = useMemo(
        () => (term ? INITIAL_INGREDIENTS.filter(i => matches(i.name) || matches(i.category ?? '')) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [term]
    );
    const usage = useMemo(() => {
        const count = new Map<string, number>();
        recipes.forEach(r => r.ingredients.forEach(ri => count.set(ri.ingredientId, (count.get(ri.ingredientId) ?? 0) + 1)));
        return count;
    }, [recipes]);

    const add = () => {
        const result = createCustomIngredient(name, carbs, category);
        if (!result) return;
        if (!result.created) {
            setToast(`"${result.ingredient.name}" ya existe`);
            return;
        }
        if (pendingExtras) updateIngredientExtra(result.ingredient.id, pendingExtras);
        setName(''); setCarbs(''); setCategory(''); setPendingExtras(null);
        setToast('Ingrediente creado');
    };

    return (
        <div className="space-y-5 pb-4">
            {scanning && <BarcodeScanner onClose={() => setScanning(false)} onDetected={(code) => { setScanning(false); lookup(code); }} />}
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Apple className="text-green-500" size={24} />
                Ingredientes
            </h2>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                    type="search"
                    placeholder="Buscar en mis ingredientes y en la base de datos..."
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800 text-sm dark:text-gray-100"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <section className="bg-green-50 dark:bg-green-900/20 p-3 rounded-2xl border border-green-100 dark:border-green-800 space-y-2">
                <div className="text-[0.6875rem] font-bold text-green-700 dark:text-green-400 uppercase">Nuevo ingrediente</div>
                <div className="flex gap-2">
                    <input
                        type="text" inputMode="numeric" placeholder="Código de barras (envasados)" aria-label="Código de barras"
                        className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none dark:text-gray-100"
                        value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
                    />
                    <button onClick={() => lookup(barcode)} disabled={!barcode || lookingUp}
                        className="px-3 py-2 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 disabled:opacity-50 rounded-lg text-sm font-bold">
                        {lookingUp ? '…' : 'Buscar'}
                    </button>
                    {canScanBarcodes() && (
                        <button onClick={() => setScanning(true)} aria-label="Escanear código de barras con la cámara"
                            className="px-3 py-2 bg-green-500 text-white rounded-lg">
                            <ScanBarcode size={18} />
                        </button>
                    )}
                </div>
                <input
                    type="text"
                    placeholder="Nombre"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none dark:text-gray-100"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <div className="flex gap-2">
                    <NumberInput
                        allowEmpty
                        max={100}
                        placeholder="HC/100g"
                        aria-label="Hidratos por 100 gramos"
                        className="w-24 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none dark:text-gray-100"
                        value={carbs}
                        onChange={setCarbs}
                    />
                    <input
                        type="text"
                        placeholder="Categoría (opcional)"
                        className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none dark:text-gray-100"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    />
                    <button
                        onClick={add}
                        disabled={!name.trim() || carbs === ''}
                        className="px-3 py-2 bg-green-500 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-lg text-sm font-bold flex items-center gap-1"
                    >
                        <Plus size={16} /> Crear
                    </button>
                </div>
            </section>

            <section className="space-y-2">
                <h3 className="text-[0.6875rem] font-black uppercase text-gray-500 tracking-widest px-1">
                    Mis ingredientes ({customIngredients.length})
                </h3>
                {mine.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                        {customIngredients.length === 0 ? 'Aún no has creado ingredientes propios.' : 'Ninguno coincide con la búsqueda.'}
                    </p>
                ) : mine.map(i => (
                    <div key={i.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-2">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                aria-label="Nombre del ingrediente"
                                value={i.name}
                                onChange={(e) => updateCustomIngredient(i.id, { name: e.target.value })}
                                className="flex-1 min-w-0 font-bold text-sm outline-none bg-transparent dark:text-gray-100"
                            />
                            <button onClick={() => removeCustomIngredient(i.id)} className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1" title="Eliminar ingrediente">
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <NumberInput
                                max={100}
                                aria-label={`Hidratos por 100 gramos de ${i.name}`}
                                value={i.carbsPer100g}
                                onChange={(v) => updateCustomIngredient(i.id, { carbsPer100g: v === '' ? 0 : v })}
                                className="w-20 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded text-sm text-right outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800 dark:text-gray-100"
                            />
                            <span className="text-xs text-gray-500 shrink-0">g HC/100g</span>
                            <input
                                type="text"
                                placeholder="Categoría"
                                aria-label="Categoría"
                                value={i.category ?? ''}
                                onChange={(e) => updateCustomIngredient(i.id, { category: e.target.value })}
                                className="flex-1 min-w-0 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded text-xs outline-none dark:text-gray-100"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-[0.6875rem] text-gray-500">{(usage.get(i.id) ?? 0) > 0 ? `Usado en ${usage.get(i.id)} receta${usage.get(i.id) === 1 ? '' : 's'}` : ''}</div>
                            <button onClick={() => setExpanded(expanded === i.id ? null : i.id)} aria-expanded={expanded === i.id}
                                className="text-xs font-bold text-green-700 dark:text-green-400 flex items-center gap-1 py-1">
                                Unidades, cocción y más <ChevronDown size={14} className={expanded === i.id ? 'rotate-180' : ''} />
                            </button>
                        </div>
                        {expanded === i.id && <ExtrasEditor ingredient={ingredientById.get(i.id) ?? i} state={state} />}
                    </div>
                ))}
            </section>

            {term && (
                <section className="space-y-1">
                    <h3 className="text-[0.6875rem] font-black uppercase text-gray-500 tracking-widest px-1">
                        Base de datos FEN ({builtIn.length})
                    </h3>
                    {builtIn.slice(0, 60).map(i => {
                        const colors = getCategoryColor(i.category);
                        return (
                            <div key={i.id} className={`px-3 py-2 rounded-lg border ${colors.bg} ${colors.border}`}>
                                <button className="w-full flex items-center justify-between text-left" aria-expanded={expanded === i.id}
                                    onClick={() => setExpanded(expanded === i.id ? null : i.id)}>
                                    <div className="min-w-0">
                                        <div className={`text-sm font-medium truncate ${colors.text}`}>{i.name}</div>
                                        {i.category && <div className={`text-[0.6875rem] uppercase font-bold opacity-70 ${colors.text}`}>{i.category}</div>}
                                    </div>
                                    <span className={`text-xs font-mono shrink-0 ml-2 flex items-center gap-1 ${colors.text}`}>
                                        {i.carbsPer100g}g HC <ChevronDown size={14} className={expanded === i.id ? 'rotate-180' : ''} />
                                    </span>
                                </button>
                                {expanded === i.id && (
                                    <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg p-2">
                                        <ExtrasEditor ingredient={ingredientById.get(i.id) ?? i} state={state} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {builtIn.length > 60 && <p className="text-[0.6875rem] text-gray-500 px-1">Mostrando 60 de {builtIn.length}. Afina la búsqueda.</p>}
                </section>
            )}
        </div>
    );
}
