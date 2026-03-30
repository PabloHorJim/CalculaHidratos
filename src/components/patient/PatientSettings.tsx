import React, { useState } from 'react';
import { Save, AlertCircle, TrendingDown, Target, Clock, ArrowLeft } from 'lucide-react';
import { usePatientState, PatientSettings as SettingsType } from '../../hooks/usePatientState';

interface PatientSettingsProps {
    onBack: () => void;
}

export function PatientSettings({ onBack }: PatientSettingsProps) {
    const { settings, saveSettings, saveStatus } = usePatientState();
    const [localSettings, setLocalSettings] = useState<SettingsType>(settings);

    const handleSave = () => {
        saveSettings(localSettings);
    };

    const updateRatio = (meal: keyof SettingsType['ratios'], val: string) => {
        setLocalSettings(prev => ({
            ...prev,
            ratios: { ...prev.ratios, [meal]: Number(val) }
        }));
    };

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
                <h2 className="text-xl font-bold text-slate-100">Configuración Clínica</h2>
                <div className="w-10"></div>
            </div>

            <div className="bg-slate-800/50 border border-cyan-900/30 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="text-cyan-500 shrink-0 mt-0.5" size={20} />
                <p className="text-xs text-slate-400 leading-relaxed">
                    Estos datos son **privados** y solo el usuario actual tiene acceso. Modifícalo según las indicaciones de tu endocrino.
                </p>
            </div>

            {/* Ratios */}
            <div className="space-y-4">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <Target size={16} />
                    Ratios de Insulina (U/10g HC)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {['breakfast', 'lunch', 'snack', 'dinner'].map((meal) => {
                        const labels: Record<string, string> = { breakfast: 'Desayuno', lunch: 'Comida', snack: 'Merienda', dinner: 'Cena' };
                        return (
                            <div key={meal} className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                                <label htmlFor={`ratio-${meal}`} className="text-[10px] text-slate-400 uppercase font-bold block mb-1">{labels[meal]}</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        id={`ratio-${meal}`}
                                        step="0.1"
                                        min="0"
                                        value={localSettings.ratios[meal as keyof SettingsType['ratios']]}
                                        onChange={(e) => updateRatio(meal as keyof SettingsType['ratios'], e.target.value)}
                                        className="w-full bg-slate-900 text-slate-200 px-3 py-2 rounded-lg text-lg font-bold outline-none focus:ring-2 focus:ring-cyan-500/50 border border-slate-700/50"
                                    />
                                    <span className="text-xs text-slate-500">U</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Sensibilidad y Objetivo */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <TrendingDown size={16} />
                    Correcciones
                </h3>
                <div className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="isf-setting" className="flex-1">
                            <div className="font-bold text-sm text-slate-200">Sensibilidad (FSI)</div>
                            <div className="text-[10px] text-slate-400">Cuánto baja 1 Unidad (mg/dL)</div>
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                id="isf-setting"
                                value={localSettings.isf}
                                onChange={(e) => setLocalSettings(prev => ({ ...prev, isf: Number(e.target.value) }))}
                                className="w-20 bg-slate-900 text-slate-200 px-3 py-2 rounded-lg text-lg font-bold outline-none focus:ring-2 focus:ring-cyan-500/50 text-right border border-slate-700/50"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
                        <label htmlFor="target-bg-setting" className="flex-1">
                            <div className="font-bold text-sm text-slate-200">Objetivo Glucémico</div>
                            <div className="text-[10px] text-slate-400">Meta deseada (mg/dL)</div>
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                id="target-bg-setting"
                                value={localSettings.targetBg}
                                onChange={(e) => setLocalSettings(prev => ({ ...prev, targetBg: Number(e.target.value) }))}
                                className="w-20 bg-slate-900 text-slate-200 px-3 py-2 rounded-lg text-lg font-bold outline-none focus:ring-2 focus:ring-cyan-500/50 text-right border border-slate-700/50"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* DIA */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <Clock size={16} />
                    Acción Insulina
                </h3>
                <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
                    <label htmlFor="dia-setting" className="flex-1">
                        <div className="font-bold text-sm text-slate-200">Duración (DIA)</div>
                        <div className="text-[10px] text-slate-400">Horas de insulina activa</div>
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            id="dia-setting"
                            step="0.5"
                            value={localSettings.dia}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, dia: Number(e.target.value) }))}
                            className="w-20 bg-slate-900 text-slate-200 px-3 py-2 rounded-lg text-lg font-bold outline-none focus:ring-2 focus:ring-cyan-500/50 text-right border border-slate-700/50"
                        />
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <button
                onClick={handleSave}
                className="w-full py-4 bg-cyan-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-900/20 active:scale-[0.98]"
            >
                <Save size={20} />
                {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '¡Guardado!' : 'Guardar Configuración'}
            </button>

        </div>
    );
}
