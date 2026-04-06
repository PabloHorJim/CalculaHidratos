import React, { useEffect, useRef } from 'react';
import { Scale, Save, Share2, MessageSquare, Trash2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../hooks/useAppState';
import { getMealSlot } from '../utils/dateUtils';

interface SplitTabProps {
    state: AppState;
}

export function SplitTab({ state }: SplitTabProps) {
    const {
        family, cookware, activeFamilyProportionSum,
        selectedCookwareId, setSelectedCookwareId,
        totalWeightWithCookware, setTotalWeightWithCookware,
        totalCarbs, cachedTotalCarbs, cachedRecipeName,
        setAsideMode, setSetAsideMode,
        setAsideValue, setSetAsideValue,
        portionErrorPercent,
        isErrorDisabledForCurrentSplit, setIsErrorDisabledForCurrentSplit,
        currentRecipeName,
        saveMealToHistory, shareFullMeal, autoUpdateHistory,
        clearReparto, mealHistory
    } = state;


    const selectedItem = cookware.find(c => c.id === selectedCookwareId);
    const cookwareMass = selectedCookwareId === 'none' ? 0 : (selectedItem?.mass ?? 0);
    const hasCookwareSelection = selectedCookwareId === 'none' || !!selectedItem;
    const netWeightRaw = (typeof totalWeightWithCookware === 'number' && hasCookwareSelection)
        ? Math.max(0, totalWeightWithCookware - cookwareMass)
        : 0;

    const setAsideAmount = typeof setAsideValue === 'number' && setAsideValue > 0 ? setAsideValue : 0;
    const setAsideWeight = setAsideMode === 'percentage'
        ? netWeightRaw * (setAsideAmount / 100)
        : setAsideMode === 'absolute'
            ? Math.min(setAsideAmount, netWeightRaw)
            : 0;
    const netWeight = Math.max(0, netWeightRaw - setAsideWeight);

    const effectiveCarbs = totalCarbs > 0 ? totalCarbs : cachedTotalCarbs;
    const adjustedCarbs = netWeightRaw > 0 ? effectiveCarbs * (netWeight / netWeightRaw) : effectiveCarbs;

    const calculatedPortions = family
        .filter(m => m.isActive)
        .map(member => {
            const memberPortion = activeFamilyProportionSum > 0
                ? (member.proportion / activeFamilyProportionSum) * netWeight
                : 0;
            const memberCarbs = activeFamilyProportionSum > 0
                ? (member.proportion / activeFamilyProportionSum) * adjustedCarbs
                : 0;

            return {
                member,
                portion: isErrorDisabledForCurrentSplit ? memberPortion : memberPortion * (1 - portionErrorPercent / 100),
                portionCarbs: memberCarbs
            };
        });

    const historicalWarnings = React.useMemo(() => {
        const warnings: string[] = [];
        const currentSlot = getMealSlot(new Date().getHours());

        // Filter history by the current meal slot (breakfast, lunch, dinner, night)
        const sameSlotHistory = mealHistory.filter(m =>
            getMealSlot(new Date(m.timestamp).getHours()) === currentSlot
        );

        // 1. Check historical HC/100g for this recipe (within same slot)
        if (cachedRecipeName && netWeight > 0) {
            const lastSimilarMeal = [...sameSlotHistory]
                .reverse()
                .find(m => m.recipeName === cachedRecipeName && m.totalCarbs && m.netWeight);

            if (lastSimilarMeal && lastSimilarMeal.netWeight > 0) {
                const lastHc100g = (lastSimilarMeal.totalCarbs / lastSimilarMeal.netWeight) * 100;
                const currentHc100g = (adjustedCarbs / netWeight) * 100;

                if (Math.max(lastHc100g, currentHc100g) / Math.min(lastHc100g, currentHc100g) > 1.5) {
                    warnings.push(`La receta ha cambiado para esta franja horaria: antes tenía ${lastHc100g.toFixed(1)}g HC/100g, ahora ${currentHc100g.toFixed(1)}g HC/100g.`);
                }
            }
        }

        // 2. Check for abnormally large portions (within same slot)
        let portionWarning = false;
        calculatedPortions.forEach(cp => {
            const memberRecentMeals = sameSlotHistory
                .slice(-15) // Look at slightly fewer recent meals since they are slot-specific
                .map(m => m.portions?.find(p => p.memberName === cp.member.name))
                .filter((p): p is NonNullable<typeof p> => !!p && p.weight > 0);

            if (memberRecentMeals.length >= 3) {
                const avgWeight = memberRecentMeals.reduce((sum, p) => sum + p.weight, 0) / memberRecentMeals.length;
                if (cp.portion > 300 && cp.portion > avgWeight * 1.5) {
                    portionWarning = true;
                }
            }
        });

        if (portionWarning) {
            warnings.push('Se ha detectado una ración inusualmente alta para este momento del día (>50% sobre tu media en esta franja).');
        }

        return warnings;
    }, [cachedRecipeName, netWeight, adjustedCarbs, mealHistory, calculatedPortions]);

    const portionsForSharing = calculatedPortions.map(p => ({
        memberName: p.member.name,
        weight: p.portion,
        carbs: p.portionCarbs,
        isDiabetic: p.member.isDiabetic
    }));

    const displayRecipeName = currentRecipeName || cachedRecipeName || 'Comida sin nombre';

    // ---- auto-update history on split changes (debounced 800ms) ----
    const autoUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (autoUpdateRef.current) clearTimeout(autoUpdateRef.current);
        autoUpdateRef.current = setTimeout(() => {
            if (netWeight > 0) {
                autoUpdateHistory(
                    displayRecipeName,
                    effectiveCarbs,
                    netWeight,
                    portionsForSharing
                );
            }
        }, 800);
        return () => { if (autoUpdateRef.current) clearTimeout(autoUpdateRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [netWeight, adjustedCarbs, portionsForSharing.map(p => p.weight + p.carbs).join(',')]);

    // Auto-save is disabled per user request, using explicit save only
    // Meals with identical names saved within 2 hours will be silently upserted by useAppState.

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
                            <input
                                type="number"
                                placeholder="0"
                                value={totalWeightWithCookware}
                                onChange={(e) => setTotalWeightWithCookware(e.target.value === '' ? '' : Number(e.target.value))}
                                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-2xl text-xl font-bold outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800 dark:text-gray-100 transition-colors"
                            />
                            <span className="text-lg font-bold text-gray-400">g</span>
                        </div>
                    </div>

                    {netWeightRaw > 0 && (
                        <>
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
                                <div className="text-xs text-green-600 dark:text-green-400 font-bold uppercase mb-1">Peso Neto de la Comida</div>
                                <div className="text-2xl font-black text-green-700 dark:text-green-400">{netWeightRaw} g</div>
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
                                            <input
                                                type="number"
                                                placeholder={setAsideMode === 'percentage' ? '25' : '500'}
                                                value={setAsideValue}
                                                onChange={(e) => setSetAsideValue(e.target.value === '' ? '' : Number(e.target.value))}
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

            {netWeight > 0 && activeFamilyProportionSum > 0 && (
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
