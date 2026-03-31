import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Calculator, Utensils, AlertTriangle, Activity, Thermometer, Droplets } from 'lucide-react';
import { usePatientState } from '../../hooks/usePatientState';
import { useAppState } from '../../hooks/useAppState';

export function BolusCalculator() {
    const { settings, getActiveProfile } = usePatientState();
    const { mealHistory } = useAppState();

    const [currentGlucose, setCurrentGlucose] = useState<number | ''>('');
    const [selectedCarbs, setSelectedCarbs] = useState<number | null>(null);
    const [extraCarbs, setExtraCarbs] = useState<number>(0);
    const [iob, setIob] = useState<number>(0);

    const [isExercise, setIsExercise] = useState(false);
    const [isIllness, setIsIllness] = useState(false);

    // Auto-infer carbs from the most recent meal in the last 2 hours
    useEffect(() => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const recent = [...mealHistory].filter(m => m.timestamp > twoHoursAgo).sort((a, b) => b.timestamp - a.timestamp);
        if (recent.length > 0 && selectedCarbs === null) {
            // Find the first non-zero portion
            const firstPortion = recent[0].portions?.find(p => p.portionCarbs > 0);
            if (firstPortion) {
                setSelectedCarbs(firstPortion.portionCarbs);
            }
        }
    }, [mealHistory]); // selectedCarbs deliberate omission to only auto-set once

    const recentMeals = useMemo(() => {
        const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
        return [...mealHistory]
            .filter(m => m.timestamp > fourHoursAgo)
            .reverse()
            .slice(0, 3);
    }, [mealHistory]);

    const activeProfile = getActiveProfile();

    // Strict math: U / 10g HC
    const totalCarbs = (selectedCarbs || 0) + extraCarbs;
    const foodBolus = activeProfile.ratio > 0 ? (totalCarbs / 10) * activeProfile.ratio : 0;

    const bg = Number(currentGlucose) || 0;
    const correctionBolus = (bg > 0 && activeProfile.isf > 0) ? (bg - settings.targetBg) / activeProfile.isf : 0;

    let grossBolus = foodBolus + correctionBolus;

    // Modifiers
    if (isExercise && settings.modifiers.exercise) {
        grossBolus = grossBolus * (1 + (settings.modifiers.exercise / 100)); // e.g. -30% -> * 0.70
    }
    if (isIllness && settings.modifiers.illness) {
        grossBolus = grossBolus * (1 + (settings.modifiers.illness / 100)); // e.g. +20% -> * 1.20
    }

    const netBolus = Math.max(0, grossBolus - iob);
    // Apply Precision Rounding
    const recommendedDose = Math.round(netBolus / settings.precision) * settings.precision;

    const isDangerousCorrection = correctionBolus < 0 && Math.abs(correctionBolus) > foodBolus;

    return (
        <div className="p-4 space-y-6 max-w-md mx-auto pt-6">

            {/* BIG GLUCOSE INPUT */}
            <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-3xl shadow-lg flex items-center justify-between">
                <div>
                    <div className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1 mb-1">
                        <Droplets size={16} /> Glucemia
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">mg/dL Actual</div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        id="main-glucose"
                        value={currentGlucose}
                        onChange={(e) => setCurrentGlucose(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="--"
                        className="w-24 bg-slate-900 text-white text-3xl font-black rounded-2xl py-2 text-center outline-none focus:ring-2 focus:ring-cyan-500 border border-slate-700 placeholder-slate-700"
                        aria-label="Glucemia capilar"
                    />
                </div>
            </div>

            {/* Step 1: Carbs */}
            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-3xl space-y-4 shadow-lg">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                    <Utensils size={16} /> Comida (HC)
                </h3>

                {/* Inferred or Manual */}
                <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-700">
                    <div className="flex-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Cantidad a cubrir</div>
                        <input
                            type="number"
                            id="manual-carbs"
                            value={selectedCarbs !== null ? Number(selectedCarbs).toString() : ''}
                            onChange={(e) => setSelectedCarbs(e.target.value ? Number(e.target.value) : null)}
                            placeholder="Ej. 45"
                            className="bg-transparent w-full text-slate-100 font-black text-2xl outline-none placeholder-slate-700"
                            aria-label="Gramos de carbohidratos"
                        />
                    </div>
                    <span className="text-slate-500 font-bold text-lg">g</span>
                </div>

                {/* Quick select from recent history */}
                {recentMeals.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-700/50">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Inferencia del Chef</div>
                        <div className="flex gap-2 overflow-x-auto pb-2 pb-1 snap-x">
                            {recentMeals.map(meal => (
                                meal.portions?.filter(p => p.portionCarbs > 0).map((p, i) => (
                                    <button
                                        key={`${meal.id}-${i}`}
                                        onClick={() => setSelectedCarbs(p.portionCarbs)}
                                        className={`snap-start shrink-0 px-3 py-2 rounded-xl text-left border transition-all ${selectedCarbs === p.portionCarbs ? 'bg-cyan-900 border-cyan-500' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`}
                                    >
                                        <div className="text-[10px] text-slate-400 truncate max-w-[80px]">{meal.recipeName}</div>
                                        <div className="font-black text-slate-100">{p.portionCarbs.toFixed(1)}g</div>
                                    </button>
                                ))
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Step 2: Extras */}
            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-3xl space-y-4 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        <Plus size={16} /> Extras +
                    </h3>
                    <div className="text-slate-100 font-black text-lg bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">{extraCarbs}g</div>
                </div>

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
                {extraCarbs > 0 && (
                    <div className="flex justify-end">
                        <button onClick={() => setExtraCarbs(0)} className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300">
                            Borrar Extras
                        </button>
                    </div>
                )}
            </div>

            {/* Step 3: Modifiers and IOB */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-2">
                    <label htmlFor="iob-input" className="text-[10px] font-black text-cyan-400 uppercase tracking-widest text-center">Insulina Activa (IOB)</label>
                    <input
                        type="number"
                        id="iob-input"
                        step={settings.precision}
                        value={iob || ''}
                        onChange={(e) => setIob(Number(e.target.value))}
                        placeholder="0.0"
                        className="w-full bg-slate-900 text-slate-100 px-2 py-2 rounded-xl text-center font-black text-xl outline-none border border-slate-700 focus:border-cyan-500 placeholder-slate-700"
                        aria-label="Unidades de insulina activa a bordo"
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={() => setIsExercise(!isExercise)}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-2xl border transition-all text-sm font-bold ${isExercise ? 'bg-green-900/40 border-green-500 text-green-400' : 'bg-slate-800/80 border-slate-700 text-slate-400'}`}
                    >
                        <Activity size={16} /> Deporte
                    </button>
                    <button
                        onClick={() => setIsIllness(!isIllness)}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-2xl border transition-all text-sm font-bold ${isIllness ? 'bg-orange-900/40 border-orange-500 text-orange-400' : 'bg-slate-800/80 border-slate-700 text-slate-400'}`}
                    >
                        <Thermometer size={16} /> Enfermedad
                    </button>
                </div>
            </div>

            {/* Final Target */}
            <div className="bg-gradient-to-br from-cyan-900 to-slate-900 border border-cyan-800 p-6 rounded-3xl shadow-xl mt-4">
                <div className="text-center mb-6">
                    <div className="text-xs text-cyan-300/70 font-bold uppercase tracking-widest mb-1">Dosis Recomendada</div>
                    <div className="text-6xl font-black text-white">{recommendedDose.toFixed(1)} <span className="text-2xl text-cyan-400">U</span></div>
                </div>

                <div className="space-y-2 text-[10px] uppercase font-bold text-slate-300">
                    <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-slate-400">Total HC a cubrir:</span>
                        <span className="text-white">{totalCarbs}g <span className="text-slate-500 font-normal">({(foodBolus).toFixed(1)}U @ {activeProfile.ratio}U/10g)</span></span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2">
                        <span className="text-slate-400">Glucosa ({bg || '--'}):</span>
                        <span className="text-white">Target {settings.targetBg} <span className="text-slate-500 font-normal">({correctionBolus > 0 ? '+' : ''}{correctionBolus.toFixed(1)}U)</span></span>
                    </div>

                    {(isExercise || isIllness) && (
                        <div className="flex justify-between border-b border-white/5 pb-2 text-orange-300">
                            <span>Modificadores Activos:</span>
                            <span>{isExercise ? `Deporte (${settings.modifiers.exercise}%)` : ''} {isIllness ? `Enfermedad (+${settings.modifiers.illness}%)` : ''}</span>
                        </div>
                    )}

                    {iob > 0 && (
                        <div className="flex justify-between text-yellow-400/90 pt-1">
                            <span>Menos Insulina Activa:</span>
                            <span>-{iob}U</span>
                        </div>
                    )}
                </div>

                {isDangerousCorrection && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-xl flex items-start gap-2 text-red-400 text-xs font-bold leading-tight">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <span>¡Peligro! La corrección requerida indica Hipoglucemia severa. Ignorar el bolo de comida y realizar medidas de rescate.</span>
                    </div>
                )}
            </div>

        </div>
    );
}
