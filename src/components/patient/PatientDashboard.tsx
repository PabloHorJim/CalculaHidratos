import React, { useState } from 'react';
import { Activity, Droplets, Zap, ArrowRight, Settings } from 'lucide-react';
import { usePatientState } from '../../hooks/usePatientState';

interface PatientDashboardProps {
    manualGlucose: string;
    setManualGlucose: (val: string) => void;
    onOpenSettings: () => void;
    onOpenCalculator: () => void;
}

export function PatientDashboard({ manualGlucose, setManualGlucose, onOpenSettings, onOpenCalculator }: PatientDashboardProps) {
    const { settings, user } = usePatientState();

    // Lógica temporal para mostrar la glucosa. En el futuro se conectará a Nightscout/xDrip+.
    const currentGlucose = manualGlucose ? Number(manualGlucose) : null;
    const isHigh = currentGlucose && currentGlucose > settings.targetBg + 40;
    const isLow = currentGlucose && currentGlucose < 70;

    return (
        <div className="p-4 space-y-6 max-w-md mx-auto pb-24">

            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-xl font-black text-slate-100 uppercase tracking-wide">Dosis</h2>
                    <div className="text-xs text-slate-400">Modo Clínico {user ? 'Online' : 'Offline'}</div>
                </div>
                <button onClick={onOpenSettings} className="p-2 bg-slate-800 text-slate-300 hover:text-cyan-400 rounded-xl transition-colors shadow-sm">
                    <Settings size={22} />
                </button>
            </div>

            {/* GLUCOSE WIDGET */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase text-xs tracking-widest">
                        <Activity size={16} /> Glucosa Actual
                    </div>
                </div>

                <div className="flex items-baseline gap-2 mb-6">
                    {currentGlucose ? (
                        <>
                            <span className={`text-6xl font-black tracking-tighter ${isHigh ? 'text-yellow-400' : isLow ? 'text-red-400' : 'text-slate-100'}`}>
                                {currentGlucose}
                            </span>
                            <span className="text-lg text-slate-500 font-medium">mg/dL</span>
                        </>
                    ) : (
                        <span className="text-4xl font-black text-slate-600 tracking-tighter">--</span>
                    )}
                </div>

                {/* Manual Input Fallback */}
                <div className="bg-slate-900/50 rounded-2xl p-3 flex items-center gap-3 border border-slate-700/50">
                    <Droplets size={20} className="text-slate-500 shrink-0" />
                    <input
                        type="number"
                        placeholder="Glucemia capilar"
                        value={manualGlucose}
                        onChange={(e) => setManualGlucose(e.target.value)}
                        className="bg-transparent w-full text-slate-200 outline-none font-bold text-lg placeholder-slate-600"
                    />
                </div>
            </div>

            {/* QUICK ACTIONS */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={onOpenCalculator}
                    className="col-span-2 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-2xl font-bold flex items-center justify-between px-6 transition-all shadow-lg shadow-cyan-900/20 active:scale-[0.98]"
                >
                    <div className="flex items-center gap-3">
                        <Activity size={20} />
                        <span className="text-lg">Calcular Dosis</span>
                    </div>
                    <ArrowRight size={20} className="opacity-70" />
                </button>

                <button className="py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 transition-all">
                    <Zap size={24} className="text-yellow-400" />
                    <span className="text-sm">Corrección</span>
                </button>

                <button className="py-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 transition-all">
                    <Activity size={24} className="text-green-400" />
                    <span className="text-sm">Registrar</span>
                </button>
            </div>

        </div>
    );
}
