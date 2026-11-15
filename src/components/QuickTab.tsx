import React, { useMemo, useState } from 'react';
import { Cookie, Search, Trash2, Save } from 'lucide-react';
import { AppState } from '../hooks/useAppState';
import { PatientState } from '../hooks/usePatientState';
import { RecipeIngredient } from '../types';
import { ingredientCarbs, recipeMacros } from '../utils/nutrition';
import { NumberInput } from './NumberInput';
import { IngredientAmount } from './IngredientAmount';

interface QuickTabProps {
    state: AppState;
    patient: PatientState;
}

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Something one person eats on their own (a piece of fruit, a snack, bread...): no pot,
 * no sharing out. It is saved in the meal history for that person only.
 */
export function QuickTab({ state, patient }: QuickTabProps) {
    const { family, ingredients, ingredientById, ingredientWeightHistory, getAdaptiveWeight, saveQuickMeal, setActiveTab } = state;

    const defaultMember = family.find(m => m.id === patient.settings.memberId)
        ?? family.find(m => m.isDiabetic && m.isActive) ?? family[0];
    const [memberId, setMemberId] = useState<string>(defaultMember?.id ?? '');
    const [items, setItems] = useState<RecipeIngredient[]>([]);
    const [search, setSearch] = useState('');
    const [extraCarbs, setExtraCarbs] = useState<number | ''>('');
    const [name, setName] = useState('');

    const term = normalize(search.trim());
    const results = useMemo(() => {
        const chosen = new Set(items.map(i => i.ingredientId));
        if (!term) {
            // Most used ingredients first, pieces before the rest (fruit, bread, yogurt...)
            return ingredients
                .filter(i => !chosen.has(i.id) && (ingredientWeightHistory[i.id]?.length || i.unitWeight))
                .sort((a, b) => (ingredientWeightHistory[b.id]?.length ?? 0) - (ingredientWeightHistory[a.id]?.length ?? 0))
                .slice(0, 8);
        }
        return ingredients.filter(i => !chosen.has(i.id) && normalize(i.name).includes(term))
            .sort((a, b) => a.name.length - b.name.length).slice(0, 12);
    }, [ingredients, items, term, ingredientWeightHistory]);

    const totals = recipeMacros(items, id => ingredientById.get(id));
    const total = totals.carbs + (extraCarbs === '' ? 0 : extraCarbs);
    const member = family.find(m => m.id === memberId);

    const update = (id: string, patch: Partial<RecipeIngredient>) =>
        setItems(prev => prev.map(i => (i.ingredientId === id ? { ...i, ...patch } : i)));

    const save = () => {
        if (!saveQuickMeal(memberId, name, items, extraCarbs === '' ? 0 : extraCarbs)) return;
        setItems([]); setExtraCarbs(''); setName(''); setSearch('');
        if (patient.settings.enabled && patient.settings.memberId === memberId) setActiveTab('dose');
    };

    return (
        <div className="space-y-4 pb-4">
            <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Cookie className="text-orange-500" size={24} /> Comida rápida
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Para lo que come una sola persona sin cocinar ni repartir: fruta, pan, un yogur, un picoteo.</p>
            </div>

            <section>
                <div className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 mb-2">¿Quién lo come?</div>
                <div className="flex flex-wrap gap-2">
                    {family.map(m => (
                        <button key={m.id} onClick={() => setMemberId(m.id)} aria-pressed={m.id === memberId}
                            className={`min-h-11 px-4 rounded-xl text-sm font-bold border transition-colors ${m.id === memberId
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}>
                            {m.name}
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input type="search" placeholder="Buscar alimento..." aria-label="Buscar alimento" value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 text-base dark:text-gray-100" />
                </div>
                {results.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {results.map(i => (
                            <button key={i.id}
                                onClick={() => {
                                    setItems(prev => [...prev, { ingredientId: i.id, weight: i.unitWeight ?? getAdaptiveWeight(i.id) }]);
                                    setSearch('');
                                }}
                                className="min-h-10 px-3 rounded-xl text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-left">
                                {i.name} <span className="text-xs text-gray-500 dark:text-gray-400">{i.carbsPer100g} g/100g</span>
                            </button>
                        ))}
                    </div>
                )}
                {term && results.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No hay ningún alimento con ese nombre. Puedes crearlo en{' '}
                        <button className="underline font-bold" onClick={() => setActiveTab('ingredients')}>Ingredientes</button>
                        {' '}o escribir sus hidratos abajo.
                    </p>
                )}
            </section>

            {items.length > 0 && (
                <section className="space-y-2">
                    {items.map(item => {
                        const ingredient = ingredientById.get(item.ingredientId);
                        if (!ingredient) return null;
                        return (
                            <div key={item.ingredientId} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">{ingredient.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{ingredientCarbs(ingredient, item).toFixed(1)} g HC</div>
                                    </div>
                                    <NumberInput aria-label={`Gramos de ${ingredient.name}`} value={item.weight}
                                        onChange={(v) => update(item.ingredientId, { weight: v === '' ? 0 : v })}
                                        className="w-20 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-right text-base outline-none dark:text-gray-100" />
                                    <span className="text-sm text-gray-500 dark:text-gray-400">g</span>
                                    <button onClick={() => setItems(prev => prev.filter(i => i.ingredientId !== item.ingredientId))}
                                        aria-label={`Quitar ${ingredient.name}`} className="p-2 text-gray-500 hover:text-red-500">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <IngredientAmount className="mt-2" ingredient={ingredient} weight={item.weight} cooked={!!item.cooked}
                                    onWeight={(grams) => update(item.ingredientId, { weight: grams })}
                                    onCooked={(cooked) => update(item.ingredientId, { cooked })} />
                            </div>
                        );
                    })}
                </section>
            )}

            <section className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-700 dark:text-gray-200">
                        <span className="font-bold block">Hidratos de la etiqueta</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Para envasados: gramos de HC de lo que se come</span>
                    </span>
                    <NumberInput allowEmpty max={500} placeholder="0" value={extraCarbs} onChange={setExtraCarbs} aria-label="Hidratos leídos en la etiqueta"
                        className="w-20 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-right text-base outline-none dark:text-gray-100" />
                </label>
                <input type="text" placeholder="Nombre (opcional)" aria-label="Nombre de la comida" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm outline-none dark:text-gray-100" />
            </section>

            <section className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800 flex items-center justify-between gap-3">
                <div>
                    <div className="text-xs font-bold uppercase text-orange-700 dark:text-orange-400">Para {member?.name ?? '—'}</div>
                    <div className="text-4xl font-black text-orange-600 dark:text-orange-400 leading-none">{total.toFixed(1)} <span className="text-base font-normal">g HC</span></div>
                </div>
                <button onClick={save} disabled={!member || total <= 0}
                    className="min-h-12 px-5 bg-orange-500 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-xl font-bold flex items-center gap-2">
                    <Save size={18} /> Guardar
                </button>
            </section>
        </div>
    );
}
