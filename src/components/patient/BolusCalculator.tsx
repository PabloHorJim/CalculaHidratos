import React, { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Calculator, Utensils, AlertTriangle } from 'lucide-react';
import { usePatientState } from '../../hooks/usePatientState';
import { useAppState } from '../../hooks/useAppState';

interface BolusCalculatorProps {
    currentGlucose: number | null;
    onBack: () => void;
}

export function BolusCalculator({ currentGlucose, onBack }: BolusCalculatorProps) {
    const { settings } = usePatientState();
    const { mealHistory } = useAppState();

    const [selectedCarbs, setSelectedCarbs] = useState<number | null>(null);
    const [extraCarbs, setExtraCarbs] = useState<number>(0);
    const [iob, setIob] = useState<number>(0); // Insulina activa a bordo

    const recentMeals = useMemo(() => {
        const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
        return [...mealHistory]
            .filter(m => m.timestamp > fourHoursAgo)
            .reverse()
            .slice(0, 3);
    }, [mealHistory]);

    // Calcular parámetros según franja horaria
    const { ratio, mealName } = useMemo(() => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 12) return { ratio: settings.ratios.breakfast, mealName: 'Desayuno' };
        if (hour >= 12 && hour < 16) return { ratio: settings.ratios.lunch, mealName: 'Comida' };
        if (hour >= 16 && hour < 20) return { ratio: settings.ratios.snack, mealName: 'Merienda' };
        return { ratio: settings.ratios.dinner, mealName: 'Cena' };
    }, [settings.ratios]);

    // Fórmula: Dosis = (HC / Ratio) + ((BG - Target) / ISF) - IOB
    const totalCarbs = (selectedCarbs || 0) + extraCarbs;
    const foodBolus = ratio > 0 ? totalCarbs / ratio : 0;
    const correctionBolus = currentGlucose ? (currentGlucose - settings.targetBg) / settings.isf : 0;
    const grossBolus = foodBolus + correctionBolus;
    const recommendedDose = Math.max(0, grossBolus - iob);

    return (
        <div className="p-4 space-y-6 max-w-md mx-auto pb-24">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 text-slate-400 hover:bg-slate-800 rounded-xl transition-colors"
                    aria-label="Volver al panel principal"
                >
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <Calculator className="text-cyan-400" /> Calculadora
                </h2>
                <div className="w-10"></div>
            </div>

            {/* Paso 1: Comida (Carbohidratos Base) */}
            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-3xl space-y-4 shadow-lg">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <Utensils size={16} /> 1. La Comida
                </h3>

                {recentMeals.length > 0 ? (
                    <div className="space-y-2">
                        <div className="text-xs text-slate-400 font-bold uppercase mb-2">Repartos Recientes (Últimas 4h)</div>
                        {recentMeals.map(meal => (
                            <div key={meal.id} className="space-y-1">
                                <div className="text-xs font-bold text-slate-300">{meal.recipeName}</div>
                                <div className="flex gap-2 overflow-x-auto pb-2 pb-1 snap-x">
                                    {(meal.portions || []).filter(p => p.portionCarbs > 0).map((p, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedCarbs(p.portionCarbs)}
                                            className={`snap-start shrink-0 px-3 py-2 rounded-xl text-left border transition-all ${selectedCarbs === p.portionCarbs ? 'bg-cyan-900 border-cyan-500' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`}
                                        >
                                            <div className="text-[10px] text-slate-400 truncate max-w-[80px]">{p.memberName}</div>
                                            <div className="font-black text-slate-100">{p.portionCarbs.toFixed(1)}g HC</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-slate-500 italic pb-2">No hay repartos recientes.</div>
                )}

                <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-700">
                    <div className="flex-1">
                        <div className="text-xs text-slate-400 font-bold uppercase">Manual</div>
                        <input
                            type="number"
                            id="manual-carbs"
                            value={selectedCarbs !== null ? Number(selectedCarbs).toString() : ''}
                            onChange={(e) => setSelectedCarbs(e.target.value ? Number(e.target.value) : null)}
                            placeholder="Ej. 45"
                            className="bg-transparent w-full text-slate-100 font-black text-xl outline-none placeholder-slate-700"
                            aria-label="Gramos de carbohidratos manuales"
                        />
                    </div>
                    <span className="text-slate-500 font-bold">g HC</span>
                </div>
            </div>

            {/* Paso 2: Extras */}
            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-3xl space-y-4 shadow-lg">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <Plus size={16} /> 2. Extras (Postres, Pan...)
                </h3>

                <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 15, 20].map(val => (
                        <button
                            key={val}
                            onClick={() => setExtraCarbs(prev => prev + val)}
                            className="bg-slate-900 border border-slate-700 text-slate-300 py-2 rounded-xl font-bold hover:bg-slate-700 hover:text-cyan-400 transition-colors"
                        >
                            +{val}g
                        </button>
                    ))}
                </div>

                <div className="flex items-center justify-between bg-slate-900 p-3 rounded-2xl border border-slate-700">
                    <div className="font-bold text-slate-400 text-sm">Extras acumulados:</div>
                    <div className="flex items-center gap-4">
                        <span className="font-black text-slate-100 text-xl">{extraCarbs}g</span>
                        <button
                            onClick={() => setExtraCarbs(0)}
                            className="text-xs text-red-400 font-bold border border-red-900/50 bg-red-900/20 px-2 py-1 rounded-lg"
                        >
                            Limpiar
                        </button>
                    </div>
                </div>
            </div>

            {/* Paso 3: Insulina Activa (IOB) */}
            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-3xl space-y-3 shadow-lg">
                <div className="flex justify-between items-center">
                    <label htmlFor="iob-input" className="text-sm font-black text-cyan-400 uppercase tracking-widest">3. Insulina a Bordo</label>
                    <input
                        type="number"
                        id="iob-input"
                        step="0.5"
                        value={iob || ''}
                        onChange={(e) => setIob(Number(e.target.value))}
                        placeholder="0"
                        className="w-16 bg-slate-900 text-slate-100 px-2 py-1 rounded-lg text-center font-bold outline-none border border-slate-700 focus:border-cyan-500"
                        aria-label="Unidades de insulina activa a bordo"
                    />
                </div>
            </div>

            {/* Tarjeta Final: Dosis */}
            <div className="bg-gradient-to-br from-cyan-900 to-slate-900 border border-cyan-800 p-6 rounded-3xl shadow-xl mt-8">
                <div className="text-center mb-6">
                    <div className="text-xs text-cyan-300/70 font-bold uppercase tracking-widest mb-1">Dosis Recomendada</div>
                    <div className="text-6xl font-black text-white">{recommendedDose.toFixed(1)} <span className="text-2xl text-cyan-400">U</span></div>
                </div>

                <div className="space-y-2 text-xs text-slate-300 font-medium">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-slate-400">Total HC a cubrir:</span>
                        <span className="font-bold text-white">{totalCarbs}g <span className="text-slate-500 font-normal">({mealName}: 1/{ratio})</span></span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-slate-400">Glucosa actual:</span>
                        <span className="font-bold text-white">{currentGlucose || '--'} <span className="text-slate-500 font-normal">({correctionBolus > 0 ? '+' : ''}{correctionBolus.toFixed(1)}U)</span></span>
                    </div>
                    {iob > 0 && (
                        <div className="flex justify-between text-yellow-400/90 pt-1">
                            <span>Insulina activa (resta):</span>
                            <span className="font-bold">-{iob}U</span>
                        </div>
                    )}
                </div>

                {recommendedDose <= 0 && totalCarbs > 0 && (
                    <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-xl flex items-start gap-2 text-yellow-400 text-xs">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>La corrección negativa por glucosa baja o IOB anula la dosis de la comida. ¡Precaución!</span>
                    </div>
                )}
            </div>

        </div>
    );
}
