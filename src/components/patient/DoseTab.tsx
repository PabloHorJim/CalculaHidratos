import React, { useEffect, useMemo, useState } from 'react';
import { Syringe, Droplets, Utensils, AlertTriangle, Settings, Trash2, Activity, Thermometer } from 'lucide-react';
import { AppState } from '../../hooks/useAppState';
import { PatientState } from '../../hooks/usePatientState';
import { NumberInput } from '../NumberInput';
import { activeProfile, computeBolus, estimateIob, BolusWarning } from '../../utils/bolus';
import { memberFraction } from '../../utils/split';
import { MealHistoryEntry } from '../../types';
import { GlucoseState } from '../../hooks/useGlucose';
import { latestReading, TREND_ARROW, TREND_TEXT } from '../../glucose/sources';
import { GlucoseChart, ChartEvent } from './GlucoseChart';

interface DoseTabProps {
    state: AppState;
    patient: PatientState;
    glucoseSensor: GlucoseState;
}

interface MealOption {
    key: string;
    mealId: string | null;
    label: string;
    detail: string;
    carbs: number;
}

const RECENT_MEAL_MS = 4 * 60 * 60 * 1000;

const WARNING_TEXT: Record<BolusWarning, string> = {
    hypo: 'Glucemia por debajo del umbral de hipoglucemia: no se sugiere insulina. Trata primero la bajada y vuelve a medir.',
    belowTarget: 'Glucemia por debajo del objetivo: la dosis se ha reducido.',
    capped: 'La dosis calculada supera tu límite de seguridad y se ha recortado. Revisa los datos.',
    noProfile: 'Configura tu ratio y tu factor de sensibilidad en los ajustes.'
};

const formatUnits = (value: number, precision: number) => value.toFixed(precision < 1 ? 1 : 0);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function DoseTab({ state, patient, glucoseSensor }: DoseTabProps) {
    const { family, mealHistory, getMemberCarbs, effectiveCarbs, currentRecipeName, cachedRecipeName, setActiveTab, setToast } = state;
    const { settings, bolusHistory, addBolus, removeBolus } = patient;

    const me = family.find(m => m.id === settings.memberId) ?? null;

    // Refresh "now" every minute: the active profile and the insulin on board depend on it
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // --- where the carbs come from ---
    const mealOptions = useMemo<MealOption[]>(() => {
        if (!me) return [];
        const options: MealOption[] = [];
        const myCarbs = (meal: MealHistoryEntry) => {
            const portion = meal.portions.find(p => (p.memberId ? p.memberId === me.id : p.memberName === me.name));
            if (portion) return { carbs: portion.carbs, estimated: false };
            // Something another person ate on their own
            if (meal.kind === 'single') return { carbs: 0, estimated: false };
            // Not shared out yet: my usual share of the whole dish
            return { carbs: memberFraction(me, family) * meal.totalCarbs, estimated: true };
        };
        const liveName = currentRecipeName || cachedRecipeName;
        const live = getMemberCarbs(me);
        if (effectiveCarbs > 0 && live > 0) {
            options.push({ key: 'live', mealId: null, label: liveName || 'Comida actual', detail: 'En preparación', carbs: live });
        }
        mealHistory
            .filter(m => !m.isBatch && now - new Date(m.timestamp).getTime() < RECENT_MEAL_MS)
            .slice(0, 3)
            .forEach(meal => {
                const { carbs, estimated } = myCarbs(meal);
                if (carbs <= 0 || (liveName && meal.recipeName === liveName && options.length > 0)) return;
                options.push({
                    key: meal.id, mealId: meal.id, label: meal.recipeName,
                    detail: `${timeOf(meal.timestamp)}${estimated ? ' · sin repartir (estimado)' : ''}`, carbs
                });
            });
        return options;
    }, [me, family, mealHistory, getMemberCarbs, effectiveCarbs, currentRecipeName, cachedRecipeName, now]);

    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [manualCarbs, setManualCarbs] = useState<number | ''>('');
    const [extraCarbs, setExtraCarbs] = useState<number | ''>('');
    const [glucose, setGlucose] = useState<number | ''>('');
    const [iobOverride, setIobOverride] = useState<number | ''>('');
    const [exercise, setExercise] = useState(false);
    const [illness, setIllness] = useState(false);
    const [administered, setAdministered] = useState<number | ''>('');
    // Time of the sensor reading typed into the glucose field, if that is where it came from
    const [sensorTime, setSensorTime] = useState<number | null>(null);

    const sensor = glucoseSensor.active ? latestReading(glucoseSensor.readings, now) : null;
    const chartEvents = useMemo<ChartEvent[]>(() => {
        if (!me || !glucoseSensor.active) return [];
        const meals = mealHistory.flatMap(meal => {
            const portion = meal.portions.find(p => (p.memberId ? p.memberId === me.id : p.memberName === me.name));
            return portion && portion.carbs > 0 ? [{ time: new Date(meal.timestamp).getTime(), kind: 'meal' as const, label: String(Math.round(portion.carbs)) }] : [];
        });
        const doses = bolusHistory.map(b => ({ time: new Date(b.timestamp).getTime(), kind: 'dose' as const, label: String(b.administeredDose).replace('.', ',') }));
        return [...meals, ...doses];
    }, [me, mealHistory, bolusHistory, glucoseSensor.active]);

    // Preselect the most relevant meal once, unless it already has a dose registered
    useEffect(() => {
        if (selectedKey !== null || mealOptions.length === 0) return;
        const first = mealOptions.find(o => !o.mealId || !bolusHistory.some(b => b.mealId === o.mealId));
        if (first) setSelectedKey(first.key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mealOptions]);

    const selected = selectedKey === 'manual' ? null : mealOptions.find(o => o.key === selectedKey) ?? null;
    const mealCarbs = selectedKey === 'manual' ? (manualCarbs === '' ? 0 : manualCarbs) : selected?.carbs ?? 0;
    const totalCarbs = mealCarbs + (extraCarbs === '' ? 0 : extraCarbs);

    const profile = activeProfile(settings.profiles, new Date(now));
    const estimatedIob = estimateIob(bolusHistory, now, settings.dia);
    const iob = iobOverride === '' ? estimatedIob : iobOverride;

    const result = computeBolus({
        carbs: totalCarbs,
        glucose: glucose === '' ? null : glucose,
        iob, profile, settings, exercise, illness
    });

    // The amount to register follows the suggestion until the user types their own
    useEffect(() => { setAdministered(''); }, [result.dose]);
    const finalDose = administered === '' ? result.dose : administered;
    const alreadyDosed = !!selected?.mealId && bolusHistory.some(b => b.mealId === selected.mealId);

    const register = () => {
        if (finalDose <= 0) return;
        addBolus({
            mealId: selected?.mealId ?? null,
            mealName: selected?.label ?? (selectedKey === 'manual' ? 'Entrada manual' : 'Sin comida'),
            carbs: Math.round(totalCarbs * 10) / 10,
            glucose: glucose === '' ? null : glucose,
            iob,
            suggestedDose: result.dose,
            administeredDose: finalDose
        });
        setExtraCarbs(''); setGlucose(''); setIobOverride(''); setAdministered(''); setSensorTime(null);
        setExercise(false); setIllness(false);
        setToast(`Dosis registrada: ${formatUnits(finalDose, settings.precision)} U`);
    };

    if (!me) {
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Syringe className="text-cyan-500" size={24} /> Dosis
                </h2>
                <div className="text-center py-10 px-4 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700 space-y-3">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Indica qué miembro de la familia eres y tus parámetros de insulina para empezar.</p>
                    <button onClick={() => setActiveTab('patient')} className="px-4 py-2 bg-cyan-500 text-white rounded-xl font-bold text-sm">
                        Abrir ajustes de paciente
                    </button>
                </div>
            </div>
        );
    }

    const chip = (active: boolean) =>
        `w-full text-left p-3 rounded-xl border transition-colors ${active
            ? 'bg-cyan-500 border-cyan-500 text-white'
            : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`;
    const toggle = (active: boolean) =>
        `flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${active
            ? 'bg-cyan-100 dark:bg-cyan-900/40 border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'}`;
    const field = 'w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-xl text-right text-lg font-bold outline-none focus:ring-2 focus:ring-cyan-200 dark:focus:ring-cyan-800 dark:text-gray-100';

    return (
        <div className="space-y-4 pb-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Syringe className="text-cyan-500" size={24} /> Dosis
                </h2>
                <button onClick={() => setActiveTab('patient')} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl" title="Ajustes de paciente">
                    <Settings size={20} />
                </button>
            </div>

            {/* 1. Carbs */}
            <section className="space-y-2">
                <div className="text-[0.6875rem] font-black uppercase text-gray-500 tracking-widest px-1 flex items-center gap-1"><Utensils size={12} /> Comida de {me.name}</div>
                {mealOptions.map(option => (
                    <button key={option.key} onClick={() => setSelectedKey(option.key)} className={chip(selectedKey === option.key)}>
                        <div className="flex justify-between items-center gap-2">
                            <div className="min-w-0">
                                <div className="font-bold text-sm truncate">{option.label}</div>
                                <div className="text-[0.6875rem] opacity-70">{option.detail}{option.mealId && bolusHistory.some(b => b.mealId === option.mealId) ? ' · dosis ya registrada' : ''}</div>
                            </div>
                            <div className="text-lg font-black shrink-0">{option.carbs.toFixed(1)} <span className="text-xs font-normal">g HC</span></div>
                        </div>
                    </button>
                ))}
                <div className={chip(selectedKey === 'manual')} onClick={() => setSelectedKey('manual')}>
                    <div className="flex justify-between items-center gap-2">
                        <div className="font-bold text-sm">Otra cantidad</div>
                        <div className="flex items-center gap-1">
                            <NumberInput allowEmpty max={500} aria-label="Hidratos de la comida" placeholder="0" value={manualCarbs}
                                onChange={(v) => { setManualCarbs(v); setSelectedKey('manual'); }}
                                className="w-20 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded-lg text-right font-bold outline-none text-gray-800 dark:text-gray-100" />
                            <span className="text-xs">g HC</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 px-1">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Extras</span>
                    {[5, 10, 15].map(g => (
                        <button key={g} onClick={() => setExtraCarbs((extraCarbs === '' ? 0 : extraCarbs) + g)}
                            className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                            +{g}
                        </button>
                    ))}
                    <NumberInput allowEmpty max={300} aria-label="Hidratos extra" placeholder="0" value={extraCarbs} onChange={setExtraCarbs}
                        className="ml-auto w-16 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-right text-sm font-bold outline-none dark:text-gray-100" />
                    <span className="text-xs text-gray-500">g</span>
                </div>
            </section>

            {/* 2. Glucose and insulin on board */}
            <section className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
                {glucoseSensor.active && (
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700" aria-live="polite">
                        {sensor ? (
                            <>
                                <div>
                                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400">Sensor · hace {sensor.ageMinutes} min</div>
                                    <div className={`text-3xl font-black leading-none ${sensor.fresh ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {sensor.reading.mgdl}
                                        {sensor.reading.trend && <span className="text-2xl ml-1" title={TREND_TEXT[sensor.reading.trend]}>{TREND_ARROW[sensor.reading.trend]}</span>}
                                    </div>
                                    {sensor.reading.trend && <div className="text-xs text-gray-500 dark:text-gray-400">{TREND_TEXT[sensor.reading.trend]}</div>}
                                </div>
                                {sensor.fresh ? (
                                    <button onClick={() => { setGlucose(sensor.reading.mgdl); setSensorTime(sensor.reading.time); }}
                                        className="min-h-11 px-4 bg-cyan-500 text-white rounded-xl font-bold text-sm">
                                        Usar {sensor.reading.mgdl}
                                    </button>
                                ) : (
                                    <div className="text-xs font-medium text-yellow-800 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-xl max-w-40">
                                        Lectura antigua: mide de nuevo antes de corregir.
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {glucoseSensor.error || (glucoseSensor.loading ? 'Leyendo el sensor…' : 'Sin lecturas del sensor')}
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><Droplets size={16} className="text-cyan-500" /> Glucemia</div>
                        <div className="text-[0.6875rem] text-gray-500">mg/dL · opcional · objetivo {settings.targetBg}{sensorTime ? ` · del sensor (${timeOf(new Date(sensorTime).toISOString())})` : ''}</div>
                    </div>
                    <NumberInput allowEmpty max={600} aria-label="Glucemia actual en mg/dL" placeholder="—" value={glucose} onChange={(v) => { setGlucose(v); setSensorTime(null); }} className={field} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-100">Insulina activa</div>
                        <div className="text-[0.6875rem] text-gray-500">Estimada de tus dosis registradas: {estimatedIob.toFixed(1)} U</div>
                    </div>
                    <NumberInput allowEmpty max={50} aria-label="Insulina activa en unidades" placeholder={estimatedIob.toFixed(1)} value={iobOverride} onChange={setIobOverride} className={field} />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setExercise(!exercise)} className={toggle(exercise)} aria-pressed={exercise}>
                        <Activity size={14} /> Ejercicio −{settings.exerciseReduction}%
                    </button>
                    <button onClick={() => setIllness(!illness)} className={toggle(illness)} aria-pressed={illness}>
                        <Thermometer size={14} /> Enfermedad +{settings.illnessIncrease}%
                    </button>
                </div>
            </section>

            {/* 3. Result */}
            <section className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-2xl border border-cyan-100 dark:border-cyan-800 space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <div className="text-[0.6875rem] font-bold text-cyan-700 dark:text-cyan-400 uppercase">Dosis sugerida</div>
                        <div className="text-5xl font-black text-cyan-700 dark:text-cyan-300 leading-none">
                            {formatUnits(result.dose, settings.precision)} <span className="text-lg font-normal">U</span>
                        </div>
                    </div>
                    {profile && (
                        <div className="text-right text-[0.6875rem] text-cyan-700/80 dark:text-cyan-400/80 leading-relaxed">
                            <div>Tramo desde {profile.time}</div>
                            <div>Ratio {profile.ratio} U/10 g</div>
                            <div>Sensibilidad {profile.isf} mg/dL</div>
                        </div>
                    )}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                    <div className="flex justify-between"><span>Comida ({totalCarbs.toFixed(1)} g HC)</span><span className="font-bold">{result.foodDose.toFixed(2)} U</span></div>
                    {result.correctionDose !== 0 && (
                        <div className="flex justify-between"><span>Corrección de glucemia</span><span className="font-bold">{result.correctionDose > 0 ? '+' : ''}{result.correctionDose.toFixed(2)} U</span></div>
                    )}
                    {result.iobDeducted > 0 && (
                        <div className="flex justify-between"><span>Insulina activa descontada</span><span className="font-bold">−{result.iobDeducted.toFixed(2)} U</span></div>
                    )}
                    {result.factor !== 1 && (
                        <div className="flex justify-between"><span>Ajuste ejercicio/enfermedad</span><span className="font-bold">×{result.factor.toFixed(2)}</span></div>
                    )}
                </div>
                {result.warnings.map(w => (
                    <div key={w} className={`flex items-start gap-2 text-xs font-medium p-2 rounded-xl ${w === 'hypo' || w === 'capped'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'}`}>
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span>{WARNING_TEXT[w]}</span>
                    </div>
                ))}
                {alreadyDosed && (
                    <div className="text-xs font-medium text-yellow-800 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded-xl">
                        Ya registraste una dosis para esta comida.
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <div className="flex-1 min-w-24 text-xs font-bold text-gray-600 dark:text-gray-300">Dosis administrada</div>
                    <NumberInput allowEmpty max={settings.maxBolus} aria-label="Dosis administrada en unidades"
                        placeholder={formatUnits(result.dose, settings.precision)} value={administered} onChange={setAdministered}
                        className="w-20 px-2 py-2 bg-white dark:bg-gray-800 border border-cyan-200 dark:border-cyan-700 rounded-xl text-right font-bold outline-none dark:text-gray-100" />
                    <button onClick={register} disabled={finalDose <= 0}
                        className="px-4 py-2 bg-cyan-500 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white rounded-xl font-bold text-sm">
                        Registrar
                    </button>
                </div>
            </section>

            {glucoseSensor.active && (
                <GlucoseChart readings={glucoseSensor.readings} events={chartEvents} targetBg={settings.targetBg} hypoThreshold={settings.hypoThreshold} now={now} />
            )}

            <p className="text-[0.6875rem] text-gray-500 dark:text-gray-400 leading-tight px-1">
                ⚠️ Ayuda de cálculo con los parámetros que tú has configurado. No es un producto sanitario ni sustituye las indicaciones de tu equipo médico: comprueba siempre la dosis antes de administrarla.
            </p>

            {/* 4. Log */}
            {bolusHistory.length > 0 && (
                <section className="space-y-2">
                    <div className="text-[0.6875rem] font-black uppercase text-gray-500 tracking-widest px-1">Últimas dosis</div>
                    {bolusHistory.slice(0, 6).map(record => (
                        <div key={record.id} className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{record.mealName}</div>
                                <div className="text-[0.6875rem] text-gray-500">
                                    {new Date(record.timestamp).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })} {timeOf(record.timestamp)}
                                    {' · '}{record.carbs} g HC{record.glucose !== null ? ` · ${record.glucose} mg/dL` : ''}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-black text-cyan-600 dark:text-cyan-400 leading-none">{formatUnits(record.administeredDose, settings.precision)} U</div>
                                {record.administeredDose !== record.suggestedDose && (
                                    <div className="text-[0.6875rem] text-gray-500">sugerida {formatUnits(record.suggestedDose, settings.precision)}</div>
                                )}
                            </div>
                            <button onClick={() => { if (window.confirm('¿Eliminar este registro de dosis?')) removeBolus(record.id); }}
                                className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500" title="Eliminar registro">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
}
