import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function PatientApp() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-mono flex flex-col items-center justify-center p-6">
            <h1 className="text-3xl font-bold text-cyan-400 mb-4">Patient Mode</h1>
            <p className="text-slate-400 text-center max-w-sm mb-8">
                Esta es la nueva sub-aplicación clínica aislada. Aquí se incluirán el CGM y el calculador de dosis médicas.
            </p>
            <button
                onClick={() => navigate('/chef')}
                className="px-6 py-3 bg-slate-800 text-cyan-400 font-bold rounded-xl border border-cyan-900 hover:bg-slate-700 transition-colors"
            >
                Volver a Cocina
            </button>
        </div>
    );
}
