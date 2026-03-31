import React, { useState, useMemo } from 'react';
import { Save, AlertCircle, Target, Clock, Settings, Activity, Thermometer, Plus, Trash2 } from 'lucide-react';
import { usePatientState, PatientSettings as SettingsType, TimeProfile } from '../../hooks/usePatientState';

export function PatientSettings() {
    const { settings, saveSettings, saveStatus } = usePatientState();
    const [local, setLocal] = useState<SettingsType>(settings);

    const handleSave = () => saveSettings(local);

    // Profile handling
    const updateProfile = (index: number, key: keyof TimeProfile, value: string | number) => {
        const newProfiles = [...local.profiles];
        newProfiles[index] = { ...newProfiles[index], [key]: value };
        setLocal({ ...local, profiles: newProfiles.sort((a, b) => a.time.localeCompare(b.time)) });
    };

    const addProfile = () => {
        const newProfiles = [...local.profiles, { time: '12:00', ratio: 1.0, isf: 50 }];
        setLocal({ ...local, profiles: newProfiles.sort((a, b) => a.time.localeCompare(b.time)) });
    };

    const removeProfile = (index: number) => {
        if (local.profiles.length <= 1) return; // Must have at least one
        const newProfiles = local.profiles.filter((_, i) => i !== index);
        setLocal({ ...local, profiles: newProfiles });
    };

    // --- SVG Graph Logic ---
    const { polylinePoints, maxRatio } = useMemo(() => {
        if (local.profiles.length === 0) return { polylinePoints: '', maxRatio: 2 };

        const maxR = Math.max(...local.profiles.map(p => p.ratio), 1.5) * 1.2;

        let path = '';
        const width = 240;
        const height = 100;

        const getX = (time: string) => {
            const [h, m] = time.split(':').map(Number);
            return ((h + m / 60) / 24) * width;
        };
        const getY = (ratio: number) => height - (ratio / maxR) * height;

        if (local.smoothInterpolation) {
            local.profiles.forEach((p, i) => {
                const x = getX(p.time);
                const y = getY(p.ratio);
                path += `${x},${y} `;
                // wrap around point for visually closing the 24h cycle
                if (i === local.profiles.length - 1) {
                    const firstX = getX(local.profiles[0].time) + width;
                    const firstY = getY(local.profiles[0].ratio);
                    path += `${firstX},${firstY} `;
                }
            });
        } else {
            // Step-wise
            local.profiles.forEach((p, i) => {
                const x = getX(p.time);
                const y = getY(p.ratio);
                const nextP = local.profiles[(i + 1) % local.profiles.length];
                let nextX = getX(nextP.time);
                if (nextX <= x) nextX += width;

                path += `${x},${y} ${nextX},${y} `;
            });
        }

        return { polylinePoints: path, maxRatio: maxR };
    }, [local.profiles, local.smoothInterpolation]);

    return (
        <div className="p-4 space-y-6 max-w-md mx-auto pt-6">

            <div className="bg-slate-800/50 border border-cyan-900/30 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="text-cyan-500 shrink-0 mt-0.5" size={20} />
                <p className="text-xs text-slate-400 leading-relaxed">
                    Estos datos rigen la matemática estricta de la Calculadora de Bolo. Consúltalo con tu endocrino.
                </p>
            </div>

            {/* RATIO GRAPH */}
            <div className="bg-slate-800 p-4 rounded-3xl border border-slate-700 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        <Target size={16} /> Perfil Diario (UI/10g)
                    </h3>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <input
                            type="checkbox"
                            checked={local.smoothInterpolation}
                            onChange={(e) => setLocal({ ...local, smoothInterpolation: e.target.checked })}
                            className="accent-cyan-500 w-4 h-4 rounded"
                        />
                        Curva Suave
                    </label>
                </div>

                <div className="w-full h-32 bg-slate-900 rounded-2xl relative overflow-hidden border border-slate-700/50">
                    <svg viewBox="0 0 240 100" className="w-full h-full" preserveAspectRatio="none">
                        {/* Grid lines */}
                        <line x1="0" y1="50" x2="240" y2="50" stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />
                        <line x1="60" y1="0" x2="60" y2="100" stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />
                        <line x1="120" y1="0" x2="120" y2="100" stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />
                        <line x1="180" y1="0" x2="180" y2="100" stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />

                        <polyline
                            points={polylinePoints}
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {/* Data points */}
                        {local.profiles.map((p, i) => {
                            const [h, m] = p.time.split(':').map(Number);
                            const x = ((h + m / 60) / 24) * 240;
                            const y = 100 - (p.ratio / maxRatio) * 100;
                            return <circle key={i} cx={x} cy={y} r="4" fill="#22d3ee" stroke="#0f172a" strokeWidth="2" />
                        })}
                    </svg>
                    <div className="absolute top-1 left-2 text-[8px] text-slate-500 font-bold">{maxRatio.toFixed(1)}U</div>
                    <div className="absolute bottom-1 w-full flex justify-between px-2 text-[8px] text-slate-500 font-bold">
                        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
                    </div>
                </div>

                <div className="space-y-2 mt-4">
                    {local.profiles.map((profile, i) => (
                        <div key={i} className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl">
                            <input
                                type="time"
                                value={profile.time}
                                onChange={(e) => updateProfile(i, 'time', e.target.value)}
                                className="bg-transparent text-slate-200 font-bold text-sm outline-none px-2"
                                aria-label="Hora de inicio del tramo"
                            />
                            <div className="flex-1 flex gap-2">
                                <div className="flex-1 bg-slate-800 rounded-lg px-2 py-1 flex items-center justify-between border border-slate-700 focus-within:border-cyan-500">
                                    <span className="text-[10px] text-slate-500 font-bold">R</span>
                                    <input
                                        type="number" step="0.1"
                                        value={profile.ratio}
                                        onChange={(e) => updateProfile(i, 'ratio', Number(e.target.value))}
                                        className="bg-transparent text-right w-12 text-slate-200 font-bold text-sm outline-none"
                                        aria-label="Ratio de hidratos en Unidades por 10g"
                                    />
                                </div>
                                <div className="flex-1 bg-slate-800 rounded-lg px-2 py-1 flex items-center justify-between border border-slate-700 focus-within:border-cyan-500">
                                    <span className="text-[10px] text-slate-500 font-bold">ISF</span>
                                    <input
                                        type="number" step="1"
                                        value={profile.isf}
                                        onChange={(e) => updateProfile(i, 'isf', Number(e.target.value))}
                                        className="bg-transparent text-right w-12 text-slate-200 font-bold text-sm outline-none"
                                        aria-label="Sensibilidad (mg/dL por Unidad)"
                                    />
                                </div>
                            </div>
                            <button onClick={() => removeProfile(i)} className="p-2 text-red-500/50 hover:text-red-400 rounded-lg border border-red-900/0 hover:border-red-900/50 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={addProfile}
                        className="w-full py-2 border border-slate-700 border-dashed rounded-xl flex justify-center items-center gap-2 text-xs font-bold text-cyan-500 hover:bg-slate-800"
                    >
                        <Plus size={16} /> Añadir Tramo Horario
                    </button>
                </div>
            </div>

            {/* BASE PARAMS */}
            <div className="bg-slate-800 p-4 rounded-3xl border border-slate-700 shadow-lg space-y-4">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings size={16} /> Parámetros Globales
                </h3>

                <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="target-bg" className="flex-1">
                            <div className="font-bold text-sm text-slate-200">Objetivo Glucémico</div>
                            <div className="text-[10px] text-slate-400">Meta deseada (mg/dL)</div>
                        </label>
                        <input
                            type="number" id="target-bg"
                            value={local.targetBg}
                            onChange={(e) => setLocal({ ...local, targetBg: Number(e.target.value) })}
                            className="w-20 bg-slate-800 text-slate-200 px-3 py-2 rounded-lg text-lg font-bold outline-none border border-slate-600 focus:border-cyan-500 text-right"
                        />
                    </div>

                    <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="dia-bg" className="flex-1">
                            <div className="font-bold text-sm text-slate-200">Duración Insulina</div>
                            <div className="text-[10px] text-slate-400">Horas activas (DIA)</div>
                        </label>
                        <input
                            type="number" id="dia-bg" step="0.5"
                            value={local.dia}
                            onChange={(e) => setLocal({ ...local, dia: Number(e.target.value) })}
                            className="w-20 bg-slate-800 text-slate-200 px-3 py-2 rounded-lg text-lg font-bold outline-none border border-slate-600 focus:border-cyan-500 text-right"
                        />
                    </div>

                    <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="precision-select" className="flex-1">
                            <div className="font-bold text-sm text-slate-200">Precisión (Pluma/Bomba)</div>
                            <div className="text-[10px] text-slate-400">Escala de dosis final</div>
                        </label>
                        <select
                            id="precision-select"
                            value={local.precision}
                            onChange={(e) => setLocal({ ...local, precision: Number(e.target.value) })}
                            className="w-24 bg-slate-800 text-slate-200 px-3 py-2 rounded-lg text-sm font-bold outline-none border border-slate-600 focus:border-cyan-500"
                        >
                            <option value="1">1.0 U</option>
                            <option value="0.5">0.5 U</option>
                            <option value="0.1">0.1 U</option>
                            <option value="0.05">0.05 U</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* MODIFIERS */}
            <div className="bg-slate-800 p-4 rounded-3xl border border-slate-700 shadow-lg space-y-4">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={16} /> Modificadores Temporales
                </h3>

                <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="mod-exercise" className="flex-1">
                            <div className="font-bold text-sm text-green-400 flex items-center gap-1"><Activity size={14} /> Deporte</div>
                            <div className="text-[10px] text-slate-400">Reducción de dosis (%)</div>
                        </label>
                        <input
                            type="number" id="mod-exercise" step="5" max="0"
                            value={local.modifiers.exercise}
                            onChange={(e) => setLocal({ ...local, modifiers: { ...local.modifiers, exercise: Number(e.target.value) } })}
                            className="w-20 bg-slate-800 text-green-400 px-3 py-2 rounded-lg text-lg font-bold outline-none border border-slate-600 focus:border-green-500 text-right"
                        />
                    </div>

                    <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="mod-illness" className="flex-1">
                            <div className="font-bold text-sm text-orange-400 flex items-center gap-1"><Thermometer size={14} /> Enfermedad</div>
                            <div className="text-[10px] text-slate-400">Aumento de dosis (%)</div>
                        </label>
                        <input
                            type="number" id="mod-illness" step="5" min="0"
                            value={local.modifiers.illness}
                            onChange={(e) => setLocal({ ...local, modifiers: { ...local.modifiers, illness: Number(e.target.value) } })}
                            className="w-20 bg-slate-800 text-orange-400 px-3 py-2 rounded-lg text-lg font-bold outline-none border border-slate-600 focus:border-orange-500 text-right"
                        />
                    </div>
                </div>
            </div>

            <button
                onClick={handleSave}
                className="w-full py-4 bg-cyan-600 text-white rounded-3xl font-bold flex items-center justify-center gap-2 hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-900/20 active:scale-[0.98]"
            >
                <Save size={20} />
                {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '¡Perfiles Guardados!' : 'Guardar Terapia Clínica'}
            </button>

        </div>
    );
}
