import React, { useEffect, useRef } from 'react';
import { Scale, Save, Share2, MessageSquare, Trash2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../hooks/useAppState';
import { getMealSlot } from '../utils/dateUtils';
import { memberFraction } from '../utils/split';
import { NumberInput } from './NumberInput';

import { UPSERT_WINDOW_MS } from '../utils/history';

interface SplitTabProps {
    state: AppState;
}

export function SplitTab({ state }: SplitTabProps) {
    const {
        family, cookware, activeFamilyProportionSum,
        selectedCookwareId, setSelectedCookwareId,
        totalWeightWithCookware, setTotalWeightWithCookware,
        cachedRecipeName,
        setAsideMode, setSetAsideMode,
        setAsideValue, setSetAsideValue,
        portionErrorPercent,
        isErrorDisabledForCurrentSplit, setIsErrorDisabledForCurrentSplit,
        currentRecipeName,
        saveMealToHistory, shareFullMeal, autoUpdateHistory,
        clearReparto, mealHistory, isBatchCooking,
        split, effectiveCarbs,
    } = state;

    // All the weight/carbs maths lives in utils/split.ts (shared with the recipe tab)
    const { netWeightRaw, setAsideWeight, netWeight, adjustedCarbs } = split;

    const calculatedPortions = family
        .filter(m => m.isActive)
        .map(member => {
            const fraction = memberFraction(member, family);
            const memberPortion = fraction * netWeight;
            return {
                member,
                portion: isErrorDisabledForCurrentSplit ? memberPortion : memberPortion * (1 - portionErrorPercent / 100),
                portionCarbs: fraction * adjustedCarbs
            };
        });

    const displayRecipeName = currentRecipeName || cachedRecipeName || 'Comida sin nombre';

    const historicalWarnings = React.useMemo(() => {
        const warnings: string[] = [];
        const now = Date.now();
        const currentSlot = getMealSlot(new Date().getHours());

        // Earlier meals in the same slot (breakfast, lunch, dinner, night), newest first.
        // The entry being edited right now (same recipe, last two hours) is not "history".
        const sameSlotHistory = mealHistory.filter(m => {
            const t = new Date(m.timestamp).getTime();
            if (m.recipeName === displayRecipeName && now - t < UPSERT_WINDOW_MS) return false;
            return getMealSlot(new Date(m.timestamp).getHours()) === currentSlot;
        });

        // 1. Compare HC/100g with the last time this recipe was cooked
        if (cachedRecipeName && netWeight > 0 && adjustedCarbs > 0) {
            const lastSimilarMeal = sameSlotHistory
                .find(m => m.recipeName === cachedRecipeName && m.totalCarbs > 0 && m.netWeight > 0);

            if (lastSimilarMeal) {
                const lastHc100g = (lastSimilarMeal.totalCarbs / lastSimilarMeal.netWeight) * 100;
                const currentHc100g = (adjustedCarbs / netWeight) * 100;

                if (Math.max(lastHc100g, currentHc100g) / Math.min(lastHc100g, currentHc100g) > 1.5) {
                    warnings.push(`La receta ha cambiado para esta franja horaria: antes tenía ${lastHc100g.toFixed(1)}g HC/100g, ahora ${currentHc100g.toFixed(1)}g HC/100g.`);
                }
            }
        }

        // 2. Check for abnormally large portions compared with the last 15 meals of this slot
        const portionWarning = calculatedPortions.some(cp => {
            const memberRecentMeals = sameSlotHistory
                .slice(0, 15)
                .map(m => m.portions?.find(p => p.memberId ? p.memberId === cp.member.id : p.memberName === cp.member.name))
                .filter((p): p is NonNullable<typeof p> => !!p && p.weight > 0);
            if (memberRecentMeals.length < 3) return false;
            const avgWeight = memberRecentMeals.reduce((sum, p) => sum + p.weight, 0) / memberRecentMeals.length;
            return cp.portion > 300 && cp.portion > avgWeight * 1.5;
        });

        if (portionWarning) {
            warnings.push('Se ha detectado una ración inusualmente alta para este momento del día (>50% sobre tu media en esta franja).');
        }

        return warnings;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cachedRecipeName, displayRecipeName, netWeight, adjustedCarbs, mealHistory, calculatedPortions.map(p => p.portion).join(',')]);

    const portionsForSharing = calculatedPortions.map(p => ({
        memberId: p.member.id,
        memberName: p.member.name,
        weight: p.portion,
        carbs: p.portionCarbs,
        isDiabetic: p.member.isDiabetic
    }));

    // ---- auto-update history on split changes (debounced 800ms) ----
    // Only reacts to changes made while this tab is open: just opening the tab with
    // yesterday's weights still on screen must not log a new meal.
    const lastSavedSignature = useRef<string | null>(null);
    const signature = [
        displayRecipeName, isBatchCooking, netWeight.toFixed(1), adjustedCarbs.toFixed(2),
        ...portionsForSharing.map(p => `${p.memberId}:${p.weight.toFixed(1)}:${p.carbs.toFixed(2)}`)
    ].join('|');
    useEffect(() => {
        if (lastSavedSignature.current === null) {
            lastSavedSignature.current = signature;
            return;
        }
        if (lastSavedSignature.current === signature || netWeight <= 0) return;
        const timer = setTimeout(() => {
            lastSavedSignature.current = signature;
            autoUpdateHistory(displayRecipeName, adjustedCarbs, netWeight, portionsForSharing);
        }, 800);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <Scale className="text-green-500" size={24} />
                        Reparto de Comida
                    </h2>
                    <div className="flex gap-2">
                        {netWeight > 0 && (
                            <>
                                <button
                                    onClick={() => saveMealToHistory(
                                        displayRecipeName,
                                        adjustedCarbs,
                                        netWeight,
                                        portionsForSharing
                                    )}
                                    className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                                    title="Guardar en historial"
                                >
                                    <Save size={20} />
                                </button>
                                <button
                                    onClick={clearReparto}
                                    className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded-xl hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 transition-colors"
                                    title="Limpiar reparto"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Seleccionar Utensilio</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setSelectedCookwareId('none')}
                                className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${selectedCookwareId === 'none' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                            >
                                Sin utensilio
                                <div className={`text-[10px] ${selectedCookwareId === 'none' ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>Peso directo</div>
                            </button>
                            {cookware.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedCookwareId(c.id)}
                                    className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${selectedCookwareId === c.id ? 'bg-purple-500 text-white shadow-md' : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                >
                                    {c.name}
                                    <div className={`text-[10px] ${selectedCookwareId === c.id ? 'text-purple-100' : 'text-gray-400 dark:text-gray-500'}`}>{c.mass}g</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">
                            {selectedCookwareId === 'none' ? 'Peso Total' : 'Peso Total (con utensilio)'}
                        </label>
                        <div className="flex items-center gap-3">
                            <NumberInput
                                allowEmpty
                                aria-label="Peso total en gramos"
                                placeholder="0"
                                value={totalWeightWithCookware}
                                onChange={setTotalWeightWithCookware}
                                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl text-xl font-bold outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800 dark:text-gray-100 transition-colors"
                            />
                            <span className="text-lg font-bold text-gray-400">g</span>
                        </div>
                    </div>

                    {typeof totalWeightWithCookware === 'number' && totalWeightWithCookware > 0 && netWeightRaw <= 0 && (
                        <div className="text-xs font-medium text-amber-600 dark:text-amber-400 px-1">
                            {selectedCookwareId === ''
                                ? 'Selecciona un utensilio (o "Sin utensilio") para calcular el reparto.'
                                : 'El peso introducido es menor o igual que el del utensilio. Revisa el peso o el utensilio elegido.'}
                        </div>
                    )}

                    {netWeightRaw > 0 && (
                        <>
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
                                <div className="text-xs text-green-600 dark:text-green-400 font-bold uppercase mb-1">Peso Neto de la Comida</div>
                                <div className="text-2xl font-black text-green-700 dark:text-green-400">{netWeightRaw.toFixed(0)} g</div>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-2xl border border-gray-100 dark:border-gray-600">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs font-bold text-gray-400 uppercase">Apartar comida</div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => { setSetAsideMode(setAsideMode === 'none' ? 'percentage' : 'none'); setSetAsideValue(''); }}
                                            className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${setAsideMode !== 'none' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-600 text-gray-400'}`}
                                        >
                                            {setAsideMode !== 'none' ? 'Activado' : 'Desactivado'}
                                        </button>
                                    </div>
                                </div>
                                {setAsideMode !== 'none' && (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSetAsideMode('percentage')}
                                                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${setAsideMode === 'percentage' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-600'}`}
                                            >
                                                Porcentaje
                                            </button>
                                            <button
                                                onClick={() => setSetAsideMode('absolute')}
                                                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${setAsideMode === 'absolute' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-600'}`}
                                            >
                                                Gramos
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <NumberInput
                                                allowEmpty
                                                aria-label="Cantidad a apartar"
                                                max={setAsideMode === 'percentage' ? 100 : undefined}
                                                placeholder={setAsideMode === 'percentage' ? '25' : '500'}
                                                value={setAsideValue}
                                                onChange={setSetAsideValue}
                                                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 border border-gray-200 dark:border-gray-600 dark:text-gray-100"
                                            />
                                            <span className="text-sm font-bold text-gray-400">{setAsideMode === 'percentage' ? '%' : 'g'}</span>
                                        </div>
                                        {setAsideWeight > 0 && (
                                            <div className="text-xs text-gray-400">
                                                Apartando <span className="font-bold text-orange-500">{setAsideWeight.toFixed(0)}g</span> → Queda <span className="font-bold text-green-600 dark:text-green-400">{netWeight.toFixed(0)}g</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {historicalWarnings.length > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-2xl border border-yellow-200 dark:border-yellow-800/50 space-y-2 mt-4">
                            {historicalWarnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>{w}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {effectiveCarbs > 0 && netWeightRaw > 0 && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-2xl border border-orange-100 dark:border-orange-800 mt-4">
                            <div className="text-xs text-orange-600 dark:text-orange-400 font-bold uppercase mb-1">Carbohidratos</div>
                            <div className="flex justify-between items-baseline">
                                <div className="text-lg font-black text-orange-700 dark:text-orange-400">{adjustedCarbs.toFixed(1)} g HC</div>
                                {netWeight > 0 && (
                                    <div className="text-xs font-bold text-orange-600 bg-orange-100 dark:bg-orange-800/40 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-700/50">
                                        {((adjustedCarbs / netWeight) * 100).toFixed(1)} g HC/100g
                                    </div>
                                )}
                            </div>
                            {cachedRecipeName && (
                                <div className="text-[10px] text-orange-400 mt-0.5">Receta: {cachedRecipeName}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {netWeight > 0 && isBatchCooking && adjustedCarbs > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-purple-50 dark:bg-purple-900/20 p-5 rounded-3xl border border-purple-200 dark:border-purple-800/50 text-center"
                >
                    <div className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase mb-3 tracking-wider">Modo Lote / Postre</div>
                    <div className="flex flex-col gap-3">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-purple-100 dark:border-purple-800/30">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">Concentración de Carbohidratos</div>
                            <div className="text-2xl font-black text-purple-700 dark:text-purple-400">
                                {((adjustedCarbs / netWeight) * 100).toFixed(1)} <span className="text-sm font-normal text-gray-500">g HC/100g</span>
                            </div>
                        </div>
                        <div className="bg-purple-500 text-white p-4 rounded-2xl shadow-md border border-purple-400">
                            <div className="text-[10px] text-purple-200 font-bold uppercase mb-1">Pesa esto para obtener 1 Ración (10g HC)</div>
                            <div className="text-4xl font-black">
                                {((netWeight / adjustedCarbs) * 10).toFixed(0)} <span className="text-lg font-normal opacity-80">gramos</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {netWeight > 0 && activeFamilyProportionSum > 0 && !isBatchCooking && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-bold text-gray-400 uppercase">Raciones Calculadas</h3>
                        {portionErrorPercent > 0 && (
                            <button
                                onClick={() => setIsErrorDisabledForCurrentSplit(!isErrorDisabledForCurrentSplit)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${isErrorDisabledForCurrentSplit ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'}`}
                                title={isErrorDisabledForCurrentSplit ? 'Error de pesaje desactivado' : `Aplicando -${portionErrorPercent}% de error`}
                            >
                                {isErrorDisabledForCurrentSplit ? 'Error OFF' : `-${portionErrorPercent}%`}
                            </button>
                        )}
                    </div>
                    {calculatedPortions.map(({ member, portion, portionCarbs }) => (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={member.id}
                            className={`bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border flex justify-between items-center transition-colors ${member.isDiabetic ? 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-700'}`}
                        >
                            <div className="flex-1">
                                <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm">
                                    {member.name}
                                    {member.isDiabetic && <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase">Diabético</span>}
                                </div>
                                <div className="text-[10px] text-gray-400">Prop: {member.proportion}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-black text-gray-900 dark:text-gray-100 leading-none">{portion.toFixed(0)} <span className="text-xs font-normal">g</span></div>
                                {adjustedCarbs > 0 && (
                                    <div className="text-xs font-bold text-orange-600 dark:text-orange-400 mt-0.5">{portionCarbs.toFixed(1)} <span className="text-[10px] font-normal">g HC</span></div>
                                )}
                            </div>
                        </motion.div>

                    ))}

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={() => shareFullMeal(displayRecipeName, adjustedCarbs, netWeight, portionsForSharing, 'clipboard')}
                            className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold flex items-center justify-center gap-2 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            <Share2 size={16} />
                            Copiar Reparto
                        </button>
                        <button
                            onClick={() => shareFullMeal(displayRecipeName, adjustedCarbs, netWeight, portionsForSharing, 'whatsapp')}
                            className="flex-1 py-2.5 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 text-xs hover:bg-green-600 transition-colors"
                        >
                            <MessageSquare size={16} />
                            WhatsApp
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
