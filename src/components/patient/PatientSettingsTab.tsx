import React from 'react';
import { HeartPulse, Plus, Trash2, FileDown, Lock } from 'lucide-react';
import { AppState } from '../../hooks/useAppState';
import { PatientState } from '../../hooks/usePatientState';
import { NumberInput } from '../NumberInput';
import { TimeProfile } from '../../utils/bolus';
import { downloadFile } from '../../utils/exportData';
import { GlucoseState } from '../../hooks/useGlucose';
import { SensorSettings } from './SensorSettings';

interface PatientSettingsTabProps {
    state: AppState;
    patient: PatientState;
    glucoseSensor: GlucoseState;
}

export function PatientSettingsTab({ state, patient, glucoseSensor }: PatientSettingsTabProps) {
    const { family, user, setToast } = state;
    const { settings, bolusHistory, updateSettings, syncStatus } = patient;

    const setProfile = (index: number, updates: Partial<TimeProfile>) => {
        updateSettings({ profiles: settings.profiles.map((p, i) => (i === index ? { ...p, ...updates } : p)) });
    };
    const addProfile = () => {
        const used = new Set(settings.profiles.map(p => p.time));
        const time = ['07:00', '13:00', '17:00', '21:00', '12:00', '18:00', '09:00'].find(t => !used.has(t));
        if (!time) return;
        const last = settings.profiles[settings.profiles.length - 1];
        updateSettings({ profiles: [...settings.profiles, { time, ratio: last?.ratio ?? 1, isf: last?.isf ?? 50 }] });
    };
    const removeProfile = (index: number) => {
        if (settings.profiles.length <= 1) return;
        updateSettings({ profiles: settings.profiles.filter((_, i) => i !== index) });
    };

    const exportDoses = () => {
        const header = 'Fecha,Comida,HC (g),Glucemia (mg/dL),Insulina activa (U),Dosis sugerida (U),Dosis administrada (U)';
        const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        const rows = bolusHistory.map(r => [
            r.timestamp, cell(r.mealName), r.carbs, r.glucose ?? '', r.iob, r.suggestedDose, r.administeredDose
        ].join(','));
        downloadFile(`carbcalc_dosis_${new Date().toISOString().split('T')[0]}.csv`, '﻿' + header + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
        setToast(`${bolusHistory.length} dosis exportadas`);
    };

    const card = 'bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700';
    const label = 'text-[0.6875rem] uppercase font-bold text-gray-500 block mb-0.5';
    const input = 'w-full px-2 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-200 dark:focus:ring-cyan-800 dark:text-gray-100';
    const number = (key: 'targetBg' | 'hypoThreshold' | 'dia' | 'maxBolus' | 'exerciseReduction' | 'illnessIncrease', text: string, max: number) => (
        <div>
            <label className={label}>{text}</label>
            <NumberInput aria-label={text} max={max} value={settings[key]} onChange={(v) => { if (v !== '') updateSettings({ [key]: v }); }} className={input} />
        </div>
    );

    return (
        <div className="space-y-5 pb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <HeartPulse className="text-cyan-500" size={24} /> Ajustes de paciente
            </h2>

            <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl">
                <Lock size={14} className="shrink-0 mt-0.5" />
                <span>
                    Estos datos son privados: no se comparten con el grupo familiar.{' '}
                    {user
                        ? (syncStatus === 'error'
                            ? 'Ahora mismo solo están en este dispositivo (no se pudieron guardar en tu cuenta).'
                            : 'Se guardan en tu cuenta para que los tengas en todos tus dispositivos.')
                        : 'Se guardan solo en este dispositivo.'}
                </span>
            </div>

            <section className={card}>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-100">Modo paciente</div>
                        <div className="text-[0.6875rem] text-gray-500">Añade la pestaña "Dosis" con la calculadora de insulina</div>
                    </div>
                    <input type="checkbox" className="w-5 h-5 accent-cyan-500" checked={settings.enabled} onChange={(e) => {
                        const enable = e.target.checked;
                        // Health data needs explicit consent (RGPD art. 9)
                        if (enable && !window.confirm('El modo paciente guarda datos de salud (parámetros de insulina, glucemias y dosis) en este dispositivo' + (user ? ' y en un documento privado de tu cuenta' : '') + '. No se comparten con tu grupo familiar.\n\n¿Quieres activarlo?')) return;
                        updateSettings({ enabled: enable });
                    }} />
                </label>
            </section>

            <section className={card}>
                <label className={label} htmlFor="patient-member">¿Quién eres en la familia?</label>
                <select id="patient-member" className={input} value={settings.memberId ?? ''} onChange={(e) => updateSettings({ memberId: e.target.value || null })}>
                    <option value="">Selecciona…</option>
                    {family.map(m => <option key={m.id} value={m.id}>{m.name}{m.isDiabetic ? '' : ' (no marcado como diabético)'}</option>)}
                </select>
                <p className="text-[0.6875rem] text-gray-500 mt-1">Se usa para tomar tu parte de hidratos de cada comida repartida.</p>
            </section>

            <section className={`${card} space-y-3`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-100">Tramos horarios</div>
                        <div className="text-[0.6875rem] text-gray-500">Ratio en unidades por cada 10 g de HC · Sensibilidad en mg/dL por unidad</div>
                    </div>
                    <button onClick={addProfile} className="p-1.5 bg-cyan-500 text-white rounded-full" title="Añadir tramo"><Plus size={16} /></button>
                </div>
                {settings.profiles.map((p, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                        <div>
                            <label className={label}>Desde</label>
                            <input type="time" aria-label="Hora de inicio del tramo" className={input} value={p.time}
                                onChange={(e) => { if (e.target.value) setProfile(index, { time: e.target.value }); }} />
                        </div>
                        <div>
                            <label className={label}>Ratio</label>
                            <NumberInput aria-label="Ratio" max={20} className={input} value={p.ratio} onChange={(v) => { if (v !== '') setProfile(index, { ratio: v }); }} />
                        </div>
                        <div>
                            <label className={label}>Sensibilidad</label>
                            <NumberInput aria-label="Factor de sensibilidad" min={1} max={500} className={input} value={p.isf} onChange={(v) => { if (v !== '' && v >= 1) setProfile(index, { isf: v }); }} />
                        </div>
                        <button onClick={() => removeProfile(index)} disabled={settings.profiles.length <= 1}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 disabled:opacity-30" title="Eliminar tramo">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
                <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400">Usa los valores pautados por tu equipo médico. Los que aparecen por defecto son solo un ejemplo.</p>
            </section>

            <section className={`${card} grid grid-cols-2 gap-3`}>
                {number('targetBg', 'Glucemia objetivo (mg/dL)', 250)}
                {number('hypoThreshold', 'Umbral de hipoglucemia', 100)}
                {number('dia', 'Duración de la insulina (h)', 8)}
                {number('maxBolus', 'Dosis máxima (U)', 50)}
                {number('exerciseReduction', 'Reducción por ejercicio (%)', 90)}
                {number('illnessIncrease', 'Aumento por enfermedad (%)', 100)}
                <div className="col-span-2">
                    <label className={label}>Precisión de la dosis</label>
                    <div className="flex gap-2">
                        {[0.1, 0.5, 1].map(step => (
                            <button key={step} onClick={() => updateSettings({ precision: step })}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${settings.precision === step ? 'bg-cyan-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                {step} U
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {settings.enabled && <SensorSettings glucoseSensor={glucoseSensor} signedIn={!!user} setToast={setToast} />}

            <button onClick={exportDoses} disabled={bolusHistory.length === 0}
                className="w-full py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                <FileDown size={16} /> Exportar registro de dosis ({bolusHistory.length})
            </button>
        </div>
    );
}
