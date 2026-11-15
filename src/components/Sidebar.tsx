import React from 'react';
import {
    Calculator, History, Utensils, Percent, Download, Apple, HeartPulse,
    LogIn, LogOut, BarChart3, Shield, Mail, FileDown, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarButton } from './SidebarButton';
import { AppState } from '../hooks/useAppState';
import { PatientState } from '../hooks/usePatientState';

interface SidebarProps {
    state: AppState;
    patient: PatientState;
}

export function Sidebar({ state, patient }: SidebarProps) {
    const {
        activeTab, setActiveTab,
        isSidebarOpen, setIsSidebarOpen,
        user, handleLogin, handleLogout,
        portionErrorPercent, setPortionErrorPercent,
        isInstallable, handleInstallClick,
        exportMealData,
    } = state;

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsSidebarOpen(false)}
                        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 left-0 w-72 max-w-[88vw] bg-white dark:bg-gray-800 z-50 shadow-2xl flex flex-col transition-colors"
                    >
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                                    <Calculator size={18} />
                                </div>
                                <span className="font-black text-xl dark:text-gray-100">CarbCalc</span>
                            </div>
                            <p className="text-[0.6875rem] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">Opciones Avanzadas</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-1">
                            {/* Data Section */}
                            <div className="text-[0.6875rem] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-2 pb-1">Datos</div>
                            <SidebarButton
                                active={activeTab === 'history'}
                                onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }}
                                icon={<History size={20} />}
                                label="Historial de Comidas"
                                description="Ver repartos anteriores"
                            />
                            <SidebarButton
                                active={activeTab === 'stats'}
                                onClick={() => { setActiveTab('stats'); setIsSidebarOpen(false); }}
                                icon={<BarChart3 size={20} />}
                                label="Estadísticas"
                                description="Datos para diabéticos"
                            />

                            {/* Settings Section */}
                            <div className="text-[0.6875rem] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-4 pb-1">Configuración</div>
                            <SidebarButton
                                active={activeTab === 'cookware'}
                                onClick={() => { setActiveTab('cookware'); setIsSidebarOpen(false); }}
                                icon={<Utensils size={20} />}
                                label="Mis Utensilios"
                                description="Ollas, sartenes y pesos"
                            />

                            <SidebarButton
                                active={activeTab === 'ingredients'}
                                onClick={() => { setActiveTab('ingredients'); setIsSidebarOpen(false); }}
                                icon={<Apple size={20} />}
                                label="Ingredientes"
                                description="Crear, editar y consultar HC"
                            />

                            <SidebarButton
                                active={activeTab === 'settings'}
                                onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                                icon={<Settings size={20} />}
                                label="Ajustes de este móvil"
                                description="Tamaño del texto y avisos"
                            />

                            {/* Portion Error Config */}
                            <div className="pt-2">
                                <div className="flex items-center gap-3 p-3">
                                    <div className="text-gray-500 dark:text-gray-400">
                                        <Percent size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold leading-none mb-1 dark:text-gray-200">Error de pesaje</div>
                                        <div className="text-[0.6875rem] text-gray-500 dark:text-gray-400 font-medium">Reducir raciones automáticamente</div>
                                    </div>
                                </div>
                                <div className="px-3 pb-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min="0"
                                            max="20"
                                            step="1"
                                            aria-label="Porcentaje de error de pesaje"
                                            value={portionErrorPercent}
                                            onChange={(e) => setPortionErrorPercent(Number(e.target.value))}
                                            className="flex-1 accent-orange-500"
                                        />
                                        <span className={`text-sm font-bold min-w-[3ch] text-right ${portionErrorPercent > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-500'}`}>
                                            {portionErrorPercent}%
                                        </span>
                                    </div>
                                    {portionErrorPercent > 0 && (
                                        <div className="text-[0.6875rem] text-gray-500 dark:text-gray-400 mt-1">
                                            Las raciones se reducirán un {portionErrorPercent}% para compensar errores
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Patient mode */}
                            <div className="text-[0.6875rem] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-4 pb-1">Salud</div>
                            <SidebarButton
                                active={activeTab === 'patient'}
                                onClick={() => { setActiveTab('patient'); setIsSidebarOpen(false); }}
                                icon={<HeartPulse size={20} />}
                                label="Modo paciente"
                                description={patient.settings.enabled ? 'Activado · ratios y ajustes de insulina' : 'Calculadora de dosis de insulina (privado)'}
                            />

                            {/* Info Section */}
                            <div className="text-[0.6875rem] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-4 pb-1">Info</div>
                            <SidebarButton
                                active={activeTab === 'legal'}
                                onClick={() => { setActiveTab('legal'); setIsSidebarOpen(false); }}
                                icon={<Shield size={20} />}
                                label="Información Legal"
                                description="Privacidad y condiciones"
                            />

                            {/* Contact Developer */}
                            <a
                                href="mailto:pablohorjim@gmail.com?subject=CarbCalc%20—%20Sugerencia"
                                className="flex items-center gap-3 p-3 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-2xl transition-all"
                            >
                                <div className="text-gray-500 dark:text-gray-400">
                                    <Mail size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-bold leading-none mb-1">Contactar</div>
                                    <div className="text-[0.6875rem] text-gray-500 dark:text-gray-400 font-medium">Sugerencias o problemas</div>
                                </div>
                            </a>

                            {/* Export Data */}
                            <button
                                onClick={() => { exportMealData('csv'); setIsSidebarOpen(false); }}
                                className="w-full flex items-center gap-3 p-3 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-2xl transition-all"
                            >
                                <div className="text-gray-500 dark:text-gray-400">
                                    <FileDown size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-bold leading-none mb-1">Exportar datos</div>
                                    <div className="text-[0.6875rem] text-gray-500 dark:text-gray-400 font-medium">CSV para integración</div>
                                </div>
                            </button>

                            {isInstallable && (
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                                    <button
                                        onClick={handleInstallClick}
                                        className="w-full flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-2xl hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all border border-orange-100 dark:border-orange-800 group"
                                    >
                                        <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                            <Download size={20} />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold">Instalar App</div>
                                            <div className="text-[0.6875rem] opacity-70">Acceso rápido desde el móvil</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Disclaimer micro-banner */}
                        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-800">
                            <p className="text-[0.625rem] text-amber-600 dark:text-amber-400 text-center leading-tight font-medium">
                                ⚠️ App sin garantía. No sustituye el consejo médico profesional.
                            </p>
                        </div>

                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            {user ? (
                                <div className="flex items-center gap-3">
                                    <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-700 shadow-sm" referrerPolicy="no-referrer" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{user.displayName}</div>
                                        <div className="text-[0.6875rem] text-gray-500 dark:text-gray-400 truncate">{user.email}</div>
                                    </div>
                                    <button onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión" className="p-2 text-gray-500 hover:text-red-500">
                                        <LogOut size={18} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleLogin}
                                    className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                                >
                                    <LogIn size={18} />
                                    Iniciar Sesión
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
