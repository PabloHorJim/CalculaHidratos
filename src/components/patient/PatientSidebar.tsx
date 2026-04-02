import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calculator, Settings2, BarChart3, ArrowLeft, Droplets
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePatientState } from '../../hooks/usePatientState';

interface PatientSidebarProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    currentView: 'calculator' | 'stats' | 'therapy';
    setCurrentView: (view: 'calculator' | 'stats' | 'therapy') => void;
    patientState: ReturnType<typeof usePatientState>;
}

export function PatientSidebar({ isOpen, setIsOpen, currentView, setCurrentView, patientState }: PatientSidebarProps) {
    const navigate = useNavigate();
    const { user } = patientState;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 left-0 w-72 bg-slate-900 z-50 shadow-2xl flex flex-col border-r border-slate-800"
                    >
                        {/* HEADER */}
                        <div className="p-6 border-b border-slate-800 bg-slate-800/50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-cyan-900/50">
                                    <Droplets size={18} />
                                </div>
                                <span className="font-black text-xl text-slate-100 uppercase tracking-wide">Dosis</span>
                            </div>
                            <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">Modo Clínico Reservado</p>
                        </div>

                        {/* MENU */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">

                            <div>
                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-3 mb-2">Herramientas</div>
                                <div className="space-y-1">
                                    <button
                                        onClick={() => { setCurrentView('calculator'); setIsOpen(false); }}
                                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-bold text-sm ${currentView === 'calculator' ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-800' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}`}
                                    >
                                        <Calculator size={20} className={currentView === 'calculator' ? 'text-cyan-400' : 'text-slate-500'} />
                                        <div className="flex-1 text-left">Calculadora de Bolo</div>
                                    </button>

                                    <button
                                        onClick={() => { setCurrentView('stats'); setIsOpen(false); }}
                                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-bold text-sm ${currentView === 'stats' ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-800' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}`}
                                    >
                                        <BarChart3 size={20} className={currentView === 'stats' ? 'text-cyan-400' : 'text-slate-500'} />
                                        <div className="flex-1 text-left">Control Glucémico</div>
                                    </button>

                                    <button
                                        onClick={() => { setCurrentView('therapy'); setIsOpen(false); }}
                                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-bold text-sm ${currentView === 'therapy' ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-800' : 'text-slate-400 hover:bg-slate-800 border border-transparent'}`}
                                    >
                                        <Settings2 size={20} className={currentView === 'therapy' ? 'text-cyan-400' : 'text-slate-500'} />
                                        <div className="flex-1 text-left">Terapia Clínica</div>
                                    </button>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-800">
                                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-3 mb-2">Navegación</div>
                                <button
                                    onClick={() => { setIsOpen(false); navigate('/chef'); }}
                                    className="w-full flex items-center gap-3 p-3 bg-orange-900/20 text-orange-400 rounded-2xl hover:bg-orange-900/40 transition-all border border-orange-900/50 group"
                                >
                                    <div className="w-8 h-8 bg-orange-600 text-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <ArrowLeft size={18} />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="text-sm font-bold">Volver a Cocina</div>
                                        <div className="text-[10px] opacity-70 font-medium">Salir del modo médico</div>
                                    </div>
                                </button>
                            </div>

                        </div>

                        {/* FOOTER USER INFO */}
                        <div className="p-6 border-t border-slate-800 bg-slate-900">
                            {user ? (
                                <div className="flex items-center gap-3">
                                    <img src={user.photoURL || ''} alt="Foto de perfil" className="w-10 h-10 rounded-full border border-slate-700 shadow-sm" referrerPolicy="no-referrer" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-slate-200 truncate">{user.displayName}</div>
                                        <div className="text-[10px] text-slate-500 truncate">{user.email}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 text-center font-bold">Modo Offline (Sin cuenta)</div>
                            )}
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
