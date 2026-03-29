import React from 'react';
import {
    Calculator, History, Cloud, Utensils, Percent, Download,
    LogIn, LogOut, BarChart3, Shield, Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SidebarButton } from './SidebarButton';
import { AppState } from '../hooks/useAppState';

interface SidebarProps {
    state: AppState;
}

export function Sidebar({ state }: SidebarProps) {
    const {
        activeTab, setActiveTab,
        isSidebarOpen, setIsSidebarOpen,
        user, handleLogin, handleLogout,
        portionErrorPercent, setPortionErrorPercent,
        isInstallable, handleInstallClick,
    } = state;

    if (!isSidebarOpen) return null;

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
                        className="fixed inset-y-0 left-0 w-72 bg-white z-50 shadow-2xl flex flex-col"
                    >
                        <div className="p-6 border-b border-gray-100">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                                    <Calculator size={18} />
                                </div>
                                <span className="font-black text-xl">CarbCalc</span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Opciones Avanzadas</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                            <SidebarButton
                                active={activeTab === 'group'}
                                onClick={() => { setActiveTab('group'); setIsSidebarOpen(false); }}
                                icon={<Cloud size={20} />}
                                label="Sincronización en la Nube"
                                description="Compartir con la familia"
                            />
                            <SidebarButton
                                active={activeTab === 'cookware'}
                                onClick={() => { setActiveTab('cookware'); setIsSidebarOpen(false); }}
                                icon={<Utensils size={20} />}
                                label="Mis Utensilios"
                                description="Ollas, sartenes y pesos"
                            />
                            <SidebarButton
                                active={activeTab === 'legal'}
                                onClick={() => { setActiveTab('legal'); setIsSidebarOpen(false); }}
                                icon={<Shield size={20} />}
                                label="Información Legal"
                                description="Privacidad y condiciones"
                            />

                            {/* Portion Error Config */}
                            <div className="pt-4 border-t border-gray-100 mt-4">
                                <div className="flex items-center gap-3 p-3">
                                    <div className="text-gray-400">
                                        <Percent size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold leading-none mb-1">Error de pesaje</div>
                                        <div className="text-[10px] text-gray-400 font-medium">Reducir raciones automáticamente</div>
                                    </div>
                                </div>
                                <div className="px-3 pb-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min="0"
                                            max="20"
                                            step="1"
                                            value={portionErrorPercent}
                                            onChange={(e) => setPortionErrorPercent(Number(e.target.value))}
                                            className="flex-1 accent-orange-500"
                                        />
                                        <span className={`text-sm font-bold min-w-[3ch] text-right ${portionErrorPercent > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                            {portionErrorPercent}%
                                        </span>
                                    </div>
                                    {portionErrorPercent > 0 && (
                                        <div className="text-[10px] text-gray-400 mt-1">
                                            Las raciones se reducirán un {portionErrorPercent}% para compensar errores
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Contact Developer */}
                            <div className="pt-4 border-t border-gray-100 mt-2">
                                <a
                                    href="mailto:pablohormigosjimenez@gmail.com?subject=CarbCalc%20—%20Sugerencia"
                                    className="flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 rounded-2xl transition-all"
                                >
                                    <div className="text-gray-400">
                                        <Mail size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold leading-none mb-1">Contactar al desarrollador</div>
                                        <div className="text-[10px] text-gray-400 font-medium">Sugerencias o problemas</div>
                                    </div>
                                </a>
                                <a
                                    href="https://github.com/PabloHorJim/CalculaHidratos/issues"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-3 text-gray-600 hover:bg-gray-50 rounded-2xl transition-all"
                                >
                                    <div className="text-gray-400">
                                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                        </svg>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold leading-none mb-1">GitHub Issues</div>
                                        <div className="text-[10px] text-gray-400 font-medium">Reportar bugs o proponer mejoras</div>
                                    </div>
                                </a>
                            </div>

                            {isInstallable && (
                                <div className="pt-4 border-t border-gray-100 mt-4">
                                    <button
                                        onClick={handleInstallClick}
                                        className="w-full flex items-center gap-3 p-3 bg-orange-50 text-orange-600 rounded-2xl hover:bg-orange-100 transition-all border border-orange-100 group"
                                    >
                                        <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                            <Download size={20} />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold">Instalar App</div>
                                            <div className="text-[10px] opacity-70">Acceso rápido desde el móvil</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Disclaimer micro-banner */}
                        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                            <p className="text-[8px] text-amber-600 text-center leading-tight font-medium">
                                ⚠️ App sin garantía. No sustituye el consejo médico profesional.
                            </p>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50">
                            {user ? (
                                <div className="flex items-center gap-3">
                                    <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-gray-800 truncate">{user.displayName}</div>
                                        <div className="text-[10px] text-gray-400 truncate">{user.email}</div>
                                    </div>
                                    <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">
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
