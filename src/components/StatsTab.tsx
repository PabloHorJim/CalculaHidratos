import React, { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Activity } from 'lucide-react';
import { MealHistoryEntry } from '../types';
import { AppState } from '../hooks/useAppState';

interface StatsTabProps {
    state: AppState;
}

type MealType = 'desayuno' | 'comida' | 'cena' | 'todas';

function classifyMeal(timestamp: string): 'desayuno' | 'comida' | 'cena' {
    const hour = new Date(timestamp).getHours();
    if (hour >= 6 && hour < 11) return 'desayuno';
    if (hour >= 11 && hour < 16) return 'comida';
    return 'cena';
}

function getMealLabel(type: MealType): string {
    switch (type) {
        case 'desayuno': return '🌅 Desayuno';
        case 'comida': return '☀️ Comida';
        case 'cena': return '🌙 Cena';
        case 'todas': return 'Todas';
    }
}

export function StatsTab({ state }: StatsTabProps) {
    const { mealHistory, diabeticMembers, family } = state;
    const [periodDays, setPeriodDays] = useState(7);
    const [isCustomPeriod, setIsCustomPeriod] = useState(false);
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [selectedMemberId, setSelectedMemberId] = useState<string>(diabeticMembers[0]?.id || '');
    const [mealFilter, setMealFilter] = useState<MealType>('todas');

    const selectedMember = family.find(m => m.id === selectedMemberId);
    const memberName = selectedMember?.name || 'Selecciona un miembro';

    const { periodStart, periodEnd, actualDays } = useMemo(() => {
        if (isCustomPeriod && customStartDate && customEndDate) {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
            return { periodStart: start, periodEnd: end, actualDays: days };
        }
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const start = new Date();
        start.setDate(start.getDate() - periodDays);
        start.setHours(0, 0, 0, 0);
        return { periodStart: start, periodEnd: end, actualDays: periodDays };
    }, [periodDays, isCustomPeriod, customStartDate, customEndDate]);

    // Filter entries by period and member
    const filteredEntries = useMemo(() => {
        if (!selectedMemberId) return [];
        return mealHistory.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            if (entryDate < periodStart || entryDate > periodEnd) return false;
            if (mealFilter !== 'todas' && classifyMeal(entry.timestamp) !== mealFilter) return false;
            return entry.portions.some(p => {
                return selectedMember && p.memberName === selectedMember.name && p.isDiabetic;
            });
        });
    }, [mealHistory, selectedMemberId, selectedMember, periodStart, periodEnd, mealFilter]);

    // Extract carbs for the selected member from filtered entries
    const memberCarbs = useMemo(() => {
        if (!selectedMember) return [];
        return filteredEntries.map(entry => {
            const portion = entry.portions.find(p => p.memberName === selectedMember.name);
            return {
                date: entry.timestamp,
                carbs: portion?.carbs || 0,
                recipeName: entry.recipeName,
                mealType: classifyMeal(entry.timestamp)
            };
        });
    }, [filteredEntries, selectedMember]);

    // Stats calculations
    const totalCarbs = memberCarbs.reduce((sum, e) => sum + e.carbs, 0);
    const mealsCount = memberCarbs.length;
    const meanCarbs = mealsCount > 0 ? totalCarbs / mealsCount : 0;
    const maxEntry = memberCarbs.length > 0 ? memberCarbs.reduce((max, e) => e.carbs > max.carbs ? e : max) : null;
    const minEntry = memberCarbs.length > 0 ? memberCarbs.reduce((min, e) => e.carbs < min.carbs ? e : min) : null;

    // Daily carbs for chart — compute days with actual data for correct average
    const dailyData = useMemo(() => {
        const days: { date: string; carbs: number; label: string }[] = [];
        for (let i = actualDays - 1; i >= 0; i--) {
            const d = new Date(periodEnd);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayLabel = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
            const dayCarbs = memberCarbs
                .filter(e => new Date(e.date).toISOString().split('T')[0] === dateStr)
                .reduce((sum, e) => sum + e.carbs, 0);
            days.push({ date: dateStr, carbs: dayCarbs, label: dayLabel });
        }
        return days;
    }, [memberCarbs, actualDays, periodEnd]);

    // BUG FIX: daily average should use days that actually had meals, not the full period
    const daysWithData = dailyData.filter(d => d.carbs > 0).length;
    const dailyAvg = daysWithData > 0 ? totalCarbs / daysWithData : 0;

    const maxDailyCarbs = Math.max(...dailyData.map(d => d.carbs), 1);

    // Mean per meal type
    const meanByMealType = useMemo(() => {
        if (!selectedMember) return [];
        const types: ('desayuno' | 'comida' | 'cena')[] = ['desayuno', 'comida', 'cena'];
        return types.map(type => {
            const mealsOfType = mealHistory.filter(entry => {
                const entryDate = new Date(entry.timestamp);
                if (entryDate < periodStart || entryDate > periodEnd) return false;
                if (classifyMeal(entry.timestamp) !== type) return false;
                return entry.portions.some(p => p.memberName === selectedMember.name && p.isDiabetic);
            });
            const carbsOfType = mealsOfType.map(entry => {
                const portion = entry.portions.find(p => p.memberName === selectedMember.name);
                return portion?.carbs || 0;
            });
            const mean = carbsOfType.length > 0 ? carbsOfType.reduce((a, b) => a + b, 0) / carbsOfType.length : 0;
            return { type, label: getMealLabel(type), mean, count: carbsOfType.length };
        });
    }, [mealHistory, selectedMember, periodStart, periodEnd]);

    // Max for mean-by-type bars
    const maxMeanByType = Math.max(...meanByMealType.map(m => m.mean), 1);

    if (diabeticMembers.length === 0) {
        return (
            <div className="space-y-6 pb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <BarChart3 className="text-purple-500" size={24} />
                    Estadísticas
                </h2>
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                    <Activity className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
                    <p className="text-gray-400 dark:text-gray-500 text-sm">No hay miembros diabéticos configurados.</p>
                    <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Marca a alguien como diabético en la pestaña Familia.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <BarChart3 className="text-purple-500" size={24} />
                Estadísticas
            </h2>

            {/* Diabetic selector */}
            {diabeticMembers.length > 1 && (
                <div className="flex gap-2">
                    {diabeticMembers.map(dm => (
                        <button
                            key={dm.id}
                            onClick={() => setSelectedMemberId(dm.id)}
                            className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold transition-colors ${selectedMemberId === dm.id ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        >
                            {dm.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Period selector */}
            <div className="flex gap-2">
                {[7, 14, 30].map(p => (
                    <button
                        key={p}
                        onClick={() => { setPeriodDays(p); setIsCustomPeriod(false); }}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${!isCustomPeriod && periodDays === p ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                        {p} días
                    </button>
                ))}
                <button
                    onClick={() => setIsCustomPeriod(true)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${isCustomPeriod ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                    Custom
                </button>
            </div>

            {/* Custom date range */}
            {isCustomPeriod && (
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Desde</label>
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs outline-none dark:text-gray-100"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Hasta</label>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-xs outline-none dark:text-gray-100"
                        />
                    </div>
                </div>
            )}

            {/* Meal type filter */}
            <div className="flex gap-1.5">
                {(['todas', 'desayuno', 'comida', 'cena'] as MealType[]).map(type => (
                    <button
                        key={type}
                        onClick={() => setMealFilter(type)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${mealFilter === type ? 'bg-orange-500 text-white' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                        {getMealLabel(type)}
                    </button>
                ))}
            </div>

            {mealsCount === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                    <Calendar className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={36} />
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Sin datos para este periodo.</p>
                    <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Guarda comidas en el historial para ver estadísticas.</p>
                </div>
            ) : (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">HC Medio /comida</div>
                            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 leading-none">{meanCarbs.toFixed(1)}<span className="text-xs font-normal ml-1">g</span></div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">HC Diario Medio</div>
                            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 leading-none">{dailyAvg.toFixed(1)}<span className="text-xs font-normal ml-1">g</span></div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Comidas</div>
                            <div className="text-2xl font-black text-gray-800 dark:text-gray-200 leading-none">{mealsCount}</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">HC Total</div>
                            <div className="text-2xl font-black text-orange-600 dark:text-orange-400 leading-none">{totalCarbs.toFixed(0)}<span className="text-xs font-normal ml-1">g</span></div>
                        </div>
                    </div>

                    {/* Max / Min */}
                    <div className="grid grid-cols-2 gap-2">
                        {maxEntry && (
                            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl border border-red-100 dark:border-red-800">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-red-400 uppercase mb-1">
                                    <TrendingUp size={12} /> Máximo HC
                                </div>
                                <div className="text-lg font-black text-red-600 dark:text-red-400 leading-none">{maxEntry.carbs.toFixed(1)}g</div>
                                <div className="text-[10px] text-red-400 truncate mt-0.5">{maxEntry.recipeName}</div>
                            </div>
                        )}
                        {minEntry && (
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-2xl border border-green-100 dark:border-green-800">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-green-400 uppercase mb-1">
                                    <TrendingDown size={12} /> Mínimo HC
                                </div>
                                <div className="text-lg font-black text-green-600 dark:text-green-400 leading-none">{minEntry.carbs.toFixed(1)}g</div>
                                <div className="text-[10px] text-green-400 truncate mt-0.5">{minEntry.recipeName}</div>
                            </div>
                        )}
                    </div>

                    {/* Mean by meal type */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-3">Media HC por Tipo de Comida</div>
                        <div className="space-y-2">
                            {meanByMealType.map(({ type, label, mean, count }) => (
                                <div key={type} className="flex items-center gap-3">
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-300 w-24">{label}</div>
                                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${type === 'desayuno' ? 'bg-yellow-400' : type === 'comida' ? 'bg-orange-400' : 'bg-indigo-400'}`}
                                            style={{ width: `${Math.min(100, (mean / maxMeanByType) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="text-xs font-bold text-gray-600 dark:text-gray-300 min-w-[4ch] text-right">{mean.toFixed(0)}g</div>
                                    <div className="text-[10px] text-gray-400 min-w-[3ch]">({count})</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Daily bar chart */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-3">HC Diarios — {memberName}</div>
                        <div className="flex items-end gap-[2px] h-32">
                            {dailyData.map((day, i) => {
                                const height = day.carbs > 0 && maxDailyCarbs > 0
                                    ? (day.carbs / maxDailyCarbs) * 100
                                    : 0;
                                return (
                                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                                        <div
                                            className={`w-full rounded-t transition-all ${day.carbs > 0 ? 'bg-purple-400 dark:bg-purple-500 group-hover:bg-purple-500 dark:group-hover:bg-purple-400' : 'bg-gray-100 dark:bg-gray-700'}`}
                                            style={{ height: day.carbs > 0 ? `${Math.max(height, 4)}%` : '2%' }}
                                        />
                                        {actualDays <= 14 && (
                                            <div className="text-[7px] text-gray-400 -rotate-45 origin-top-left mt-1 whitespace-nowrap">{day.label}</div>
                                        )}
                                        {/* Tooltip on hover */}
                                        {day.carbs > 0 && (
                                            <div className="absolute -top-8 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[9px] px-2 py-0.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                                {day.carbs.toFixed(0)}g — {day.label}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
