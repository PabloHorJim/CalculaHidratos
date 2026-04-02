import React, { useState } from 'react';
import { BarChart3, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PatientSettings } from './PatientSettings';
import { BolusCalculator } from './BolusCalculator';
import { PatientSidebar } from './PatientSidebar';
import { usePatientState } from '../../hooks/usePatientState';
import { useAppState } from '../../hooks/useAppState';

type ViewMode = 'calculator' | 'stats' | 'therapy';

export default function PatientApp() {
    const [currentView, setCurrentView] = useState<ViewMode>('calculator');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Lift state up to provide a single source of truth for the entire Patient routing subtree
    const patientState = usePatientState();
    const appState = useAppState();

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-cyan-500/30">
            {/* Header / Top bar */}
            <div className="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-800 sticky top-0 z-20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 -ml-2 text-slate-400 hover:bg-slate-800 rounded-xl transition-colors"
                        aria-label="Abrir menú"
                    >
                        <Menu size={24} />
                    </button>
                    <div>
                        <h2 className="text-xl font-black text-slate-100 uppercase tracking-wide">Dosis</h2>
                        <div className="text-xs text-cyan-500 font-bold">Modo Clínico</div>
                    </div>
                </div>
            </div>

            <PatientSidebar
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
                currentView={currentView}
                setCurrentView={setCurrentView}
                patientState={patientState}
            />

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentView}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                >
                    {currentView === 'calculator' && <BolusCalculator patientState={patientState} appState={appState} />}
                    {currentView === 'therapy' && <PatientSettings patientState={patientState} />}
                    {currentView === 'stats' && (
                        <div className="p-8 text-center text-slate-500">
                            <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <h3 className="text-lg font-bold text-slate-300">Estadísticas Clínicas</h3>
                            <p className="text-sm mt-2">Detección de patrones y métricas de control (Próximamente)</p>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
