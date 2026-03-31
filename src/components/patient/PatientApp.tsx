import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2, Calculator, BarChart3, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PatientSettings } from './PatientSettings';
import { BolusCalculator } from './BolusCalculator';
import { usePatientState } from '../../hooks/usePatientState';

type ViewMode = 'calculator' | 'stats' | 'therapy';

export default function PatientApp() {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<ViewMode>('calculator');

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-cyan-500/30 pb-20">
            {/* Header / Top bar */}
            <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-800 sticky top-0 z-20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/chef')}
                        className="p-2 -ml-2 text-slate-400 hover:bg-slate-800 rounded-xl transition-colors"
                        aria-label="Volver a Modo Chef"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-slate-100 uppercase tracking-wide">Dosis</h2>
                        <div className="text-xs text-cyan-500 font-bold">Modo Clínico</div>
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentView}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                >
                    {currentView === 'calculator' && <BolusCalculator />}
                    {currentView === 'therapy' && <PatientSettings />}
                    {currentView === 'stats' && (
                        <div className="p-8 text-center text-slate-500">
                            <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-bold text-slate-300">Estadísticas Clínicas</h3>
                            <p className="text-sm mt-2">Detección de patrones y métricas de control (Próximamente)</p>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Bottom Nav */}
            <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 px-2 flex justify-around items-center z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] h-16">
                <button
                    onClick={() => setCurrentView('calculator')}
                    className={`flex flex-col items-center justify-center w-20 h-full ${currentView === 'calculator' ? 'text-cyan-400' : 'text-slate-500'}`}
                >
                    <Calculator size={22} className="mb-1" />
                    <span className="text-[10px] font-bold">Bolo</span>
                </button>
                <button
                    onClick={() => setCurrentView('stats')}
                    className={`flex flex-col items-center justify-center w-20 h-full ${currentView === 'stats' ? 'text-cyan-400' : 'text-slate-500'}`}
                >
                    <BarChart3 size={22} className="mb-1" />
                    <span className="text-[10px] font-bold">Control</span>
                </button>
                <button
                    onClick={() => setCurrentView('therapy')}
                    className={`flex flex-col items-center justify-center w-20 h-full ${currentView === 'therapy' ? 'text-cyan-400' : 'text-slate-500'}`}
                >
                    <Settings2 size={22} className="mb-1" />
                    <span className="text-[10px] font-bold">Terapia</span>
                </button>
            </nav>
        </div>
    );
}
