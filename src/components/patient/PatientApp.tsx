import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientDashboard } from './PatientDashboard';
import { PatientSettings } from './PatientSettings';
import { BolusCalculator } from './BolusCalculator';

type ViewMode = 'dashboard' | 'settings' | 'calculator';

export default function PatientApp() {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
    const [manualGlucose, setManualGlucose] = useState<string>('');

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-cyan-500/30">

            {currentView === 'dashboard' && (
                <PatientDashboard
                    manualGlucose={manualGlucose}
                    setManualGlucose={setManualGlucose}
                    onOpenSettings={() => setCurrentView('settings')}
                    onOpenCalculator={() => setCurrentView('calculator')}
                />
            )}

            {currentView === 'settings' && (
                <PatientSettings
                    onBack={() => setCurrentView('dashboard')}
                />
            )}

            {currentView === 'calculator' && (
                <BolusCalculator
                    currentGlucose={manualGlucose ? Number(manualGlucose) : null}
                    onBack={() => setCurrentView('dashboard')}
                />
            )}

            {/* Floating Back to Chef Button */}
            {currentView === 'dashboard' && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2">
                    <button
                        onClick={() => navigate('/chef')}
                        className="px-6 py-3 bg-slate-800/80 backdrop-blur-md text-cyan-500 font-bold border border-cyan-900/50 rounded-full shadow-2xl hover:bg-slate-700 transition-colors"
                    >
                        Volver a Cocina
                    </button>
                </div>
            )}
        </div>
    );
}
