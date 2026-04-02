import React, { useMemo } from 'react';
import { usePatientState } from '../../hooks/usePatientState';

interface PatientStatsProps {
    patientState: ReturnType<typeof usePatientState>;
}

export function PatientStats({ patientState }: PatientStatsProps) {
    const { settings } = patientState;

    const { recentBoluses, maxGlucose, maxDose } = useMemo(() => {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const recent = (settings.bolusHistory || [])
            .filter(b => new Date(b.timestamp).getTime() > oneDayAgo)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const mGlucose = Math.max(250, ...recent.map(b => b.glucose || 0));
        const mDose = Math.max(10, ...recent.map(b => (b.administeredDose || b.dose || 0)));

        return { recentBoluses: recent, maxGlucose: mGlucose, maxDose: mDose };
    }, [settings.bolusHistory]);

    if (recentBoluses.length === 0) {
        return (
            <div className="p-8 text-center text-slate-500 mt-10">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-700 shadow-sm">
                    <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-300">Estadísticas Clínicas</h3>
                <p className="text-sm mt-2">No hay bolos registrados en las últimas 24 horas.</p>
            </div>
        );
    }

    const w = 300;
    const h = 200;
    const paddingX = 20;
    const paddingY = 20;

    const graphW = w - paddingX * 2;
    const graphH = h - paddingY * 2;

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const getX = (tsStr: string) => {
        const t = new Date(tsStr).getTime();
        const p = (t - oneDayAgo) / (24 * 60 * 60 * 1000);
        return paddingX + p * graphW;
    };

    const getYGlucose = (g: number) => {
        const p = g / maxGlucose;
        return paddingY + graphH - (p * graphH);
    };

    const getYInsulin = (dose: number) => {
        const p = dose / maxDose;
        return paddingY + graphH - (p * graphH);
    };

    return (
        <div className="p-4 space-y-6 max-w-md mx-auto pt-6 pb-20">
            <h2 className="text-xl font-black text-cyan-400 uppercase tracking-widest text-center mb-2">Últimas 24H</h2>

            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-3xl shadow-lg relative overflow-hidden">
                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
                    {/* Grid */}
                    <line x1={paddingX} y1={paddingY} x2={w - paddingX} y2={paddingY} stroke="#334155" strokeDasharray="4 4" />
                    <line x1={paddingX} y1={paddingY + graphH / 2} x2={w - paddingX} y2={paddingY + graphH / 2} stroke="#334155" strokeDasharray="4 4" />
                    <line x1={paddingX} y1={paddingY + graphH} x2={w - paddingX} y2={paddingY + graphH} stroke="#334155" />

                    {/* Time reference lines (every 6 hours) */}
                    {[1, 2, 3].map(i => {
                        const x = paddingX + (i / 4) * graphW;
                        return <line key={i} x1={x} y1={paddingY} x2={x} y2={paddingY + graphH} stroke="#1e293b" />
                    })}

                    {/* Target Bg range */}
                    <rect
                        x={paddingX}
                        y={getYGlucose(settings.targetBg + 30)}
                        width={graphW}
                        height={getYGlucose(settings.targetBg - 30) - getYGlucose(settings.targetBg + 30)}
                        fill="rgba(34, 211, 238, 0.05)"
                    />

                    {/* Polyline for Glucose */}
                    <polyline
                        points={recentBoluses.filter(b => b.glucose).map(b => `${getX(b.timestamp)},${getYGlucose(b.glucose!)}`).join(' ')}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                    />

                    {/* Data Points */}
                    {recentBoluses.map((b, i) => {
                        const x = getX(b.timestamp);
                        const gY = b.glucose ? getYGlucose(b.glucose) : null;
                        const dose = b.administeredDose || b.dose || 0;
                        const iY = getYInsulin(dose);

                        return (
                            <g key={i}>
                                {/* Glucose Point */}
                                {gY && (
                                    <circle cx={x} cy={gY} r="3" fill="#22d3ee" stroke="#0f172a" strokeWidth="1.5" />
                                )}
                                {/* Insulin Bar (Bottom up) */}
                                {dose > 0 && (
                                    <rect
                                        x={x - 2}
                                        y={iY}
                                        width="4"
                                        height={paddingY + graphH - iY}
                                        fill="#fb923c"
                                        rx="1"
                                    />
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Legend */}
                <div className="flex justify-between mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-cyan-400"></div> Glucosa ({Math.round(maxGlucose)} max)</div>
                    <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-orange-400"></div> Insulina ({Math.round(maxDose)}U max)</div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Registro de Bolos</div>
                {[...recentBoluses].reverse().map((b, i) => {
                    const isManual = isNaN(Number(b.mealId));
                    return (
                        <div key={i} className="bg-slate-800/80 p-3 rounded-2xl flex justify-between items-center border border-slate-700/50 shadow-sm">
                            <div>
                                <div className="text-xs font-bold text-slate-300">{new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {isManual ? 'Manual / Libre' : 'Comida Registrada'}</div>
                                {b.carbs && <div className="text-[10px] text-slate-500 font-medium">HC Totales: {b.carbs}g</div>}
                            </div>
                            <div className="text-right flex gap-3">
                                {b.glucose && (
                                    <div>
                                        <div className="text-[9px] uppercase tracking-wider text-cyan-500 font-bold mb-0.5">Glucosa</div>
                                        <div className="text-sm font-black text-slate-100">{b.glucose}</div>
                                    </div>
                                )}
                                <div>
                                    <div className="text-[9px] uppercase tracking-wider text-orange-500 font-bold mb-0.5">Dosis</div>
                                    <div className="text-sm font-black text-slate-100">{(b.administeredDose || b.dose)?.toFixed(1)}U</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

