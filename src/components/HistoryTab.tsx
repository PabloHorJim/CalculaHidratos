import React from 'react';
import { History, Calendar, Pencil, Trash2, Share2, MessageSquare, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MealHistoryEntry } from '../types';
import { AppState } from '../hooks/useAppState';

interface HistoryTabProps {
    state: AppState;
}

export function HistoryTab({ state }: HistoryTabProps) {
    const {
        mealHistory,
        editingHistoryId, setEditingHistoryId,
        expandedHistoryId, setExpandedHistoryId,
        editingHistoryName, setEditingHistoryName,
        updateMealHistoryEntry, deleteMealHistoryEntry,
        sharePortion, copyPortionToClipboard, shareFullMeal,
    } = state;

    const groupedHistory = mealHistory.reduce((groups: { [key: string]: MealHistoryEntry[] }, entry) => {
        const date = new Date(entry.timestamp);
        const dateKey = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        const capitalizedKey = dateKey.charAt(0).toUpperCase() + dateKey.slice(1);
        if (!groups[capitalizedKey]) groups[capitalizedKey] = [];
        groups[capitalizedKey].push(entry);
        return groups;
    }, {});

    return (
        <div className="space-y-6 pb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <History className="text-orange-500" size={24} />
                Historial de Comidas
            </h2>
            {mealHistory.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                    <Calendar className="mx-auto text-gray-300 mb-3" size={48} />
                    <p className="text-gray-400 text-sm">No hay comidas registradas.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {(Object.entries(groupedHistory) as [string, MealHistoryEntry[]][]).map(([day, entries]) => (
                        <div key={day} className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-2">{day}</h3>
                            <div className="space-y-2">
                                {entries.map(entry => {
                                    const isExpanded = expandedHistoryId === entry.id;
                                    return (
                                        <div key={entry.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${isExpanded ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100 hover:border-gray-200'}`}>
                                            <div
                                                onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)}
                                                className="p-4 flex items-center justify-between cursor-pointer"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    {editingHistoryId === entry.id ? (
                                                        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="text"
                                                                value={editingHistoryName}
                                                                onChange={(e) => setEditingHistoryName(e.target.value)}
                                                                className="flex-1 px-2 py-1 bg-gray-50 border border-blue-200 rounded text-sm font-bold outline-none"
                                                                autoFocus
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') updateMealHistoryEntry(entry.id, editingHistoryName);
                                                                    if (e.key === 'Escape') setEditingHistoryId(null);
                                                                }}
                                                            />
                                                            <button
                                                                onClick={() => updateMealHistoryEntry(entry.id, editingHistoryName)}
                                                                className="p-1 text-green-500 hover:bg-green-50 rounded"
                                                            >
                                                                <CheckCircle2 size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <div className="font-bold text-gray-800 truncate">{entry.recipeName}</div>
                                                            <div className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <div className="text-xs font-black text-orange-600 leading-none">{entry.totalCarbs.toFixed(0)}g</div>
                                                    </div>
                                                    <div className="text-gray-300">
                                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </div>
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden border-t border-gray-50"
                                                    >
                                                        <div className="p-4 bg-gray-50/50 space-y-4">
                                                            <div className="flex justify-between items-center">
                                                                <div className="text-[10px] font-bold text-gray-400 uppercase">Detalles del Reparto</div>
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingHistoryId(entry.id);
                                                                            setEditingHistoryName(entry.recipeName);
                                                                        }}
                                                                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                                        title="Editar nombre"
                                                                    >
                                                                        <Pencil size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            deleteMealHistoryEntry(entry.id);
                                                                        }}
                                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                        title="Eliminar"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div className="bg-white p-3 rounded-xl border border-gray-100">
                                                                    <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Peso Neto</div>
                                                                    <div className="text-lg font-black text-gray-800">{entry.netWeight} <span className="text-xs font-normal">g</span></div>
                                                                </div>
                                                                <div className="bg-white p-3 rounded-xl border border-gray-100">
                                                                    <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Carbohidratos</div>
                                                                    <div className="text-lg font-black text-orange-600">{entry.totalCarbs.toFixed(1)} <span className="text-xs font-normal">g HC</span></div>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-2">
                                                                <div className="text-[10px] font-bold text-gray-400 uppercase px-1">Raciones por Persona</div>
                                                                {entry.portions.map((p, idx) => (
                                                                    <div key={idx} className={`bg-white p-3 rounded-xl border flex justify-between items-center ${p.isDiabetic ? 'border-blue-100 bg-blue-50/20' : 'border-gray-100'}`}>
                                                                        <div className="flex-1">
                                                                            <div className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                                                                                {p.memberName}
                                                                                {p.isDiabetic && <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase">Diabético</span>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="text-right">
                                                                                <div className="text-lg font-black text-gray-900 leading-none">{p.weight.toFixed(0)} <span className="text-xs font-normal">g</span></div>
                                                                                <div className="text-xs font-bold text-orange-600 mt-0.5">{p.carbs.toFixed(1)} <span className="text-[10px] font-normal">g HC</span></div>
                                                                            </div>
                                                                            <div className="flex gap-1">
                                                                                <button
                                                                                    onClick={() => copyPortionToClipboard(p.memberName, p.weight, p.carbs, p.isDiabetic)}
                                                                                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                                                                                    title="Copiar"
                                                                                >
                                                                                    <Share2 size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => sharePortion(p.memberName, p.weight, p.carbs, p.isDiabetic)}
                                                                                    className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg"
                                                                                    title="WhatsApp"
                                                                                >
                                                                                    <MessageSquare size={14} />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            <div className="flex gap-2 pt-1">
                                                                <button
                                                                    onClick={() => shareFullMeal(entry.recipeName, entry.totalCarbs, entry.netWeight, entry.portions, 'clipboard')}
                                                                    className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-bold flex items-center justify-center gap-1.5 text-[10px] hover:bg-gray-200 transition-colors"
                                                                >
                                                                    <Share2 size={12} />
                                                                    Copiar Todo
                                                                </button>
                                                                <button
                                                                    onClick={() => shareFullMeal(entry.recipeName, entry.totalCarbs, entry.netWeight, entry.portions, 'whatsapp')}
                                                                    className="flex-1 py-2 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 text-[10px] hover:bg-green-600 transition-colors"
                                                                >
                                                                    <MessageSquare size={12} />
                                                                    WhatsApp
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
