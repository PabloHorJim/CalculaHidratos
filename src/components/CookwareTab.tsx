import React from 'react';
import { Plus, Trash2, Utensils } from 'lucide-react';
import { AppState } from '../hooks/useAppState';

interface CookwareTabProps {
    state: AppState;
}

export function CookwareTab({ state }: CookwareTabProps) {
    const { cookware, addCookware, updateCookware, removeCookware } = state;

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Utensils className="text-purple-500" size={22} />
                    Mis Utensilios
                </h2>
                <button
                    onClick={addCookware}
                    className="p-1.5 bg-purple-500 text-white rounded-full hover:bg-purple-600"
                >
                    <Plus size={18} />
                </button>
            </div>
            <div className="space-y-2">
                {cookware.map(c => (
                    <div key={c.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-3 transition-colors">
                        <div className="flex-1">
                            <input
                                type="text"
                                value={c.name}
                                onChange={(e) => updateCookware(c.id, { name: e.target.value })}
                                className="font-bold text-sm outline-none bg-transparent w-full dark:text-gray-100"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={c.mass}
                                onChange={(e) => updateCookware(c.id, { mass: Number(e.target.value) })}
                                className="w-20 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded text-sm text-right outline-none focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 dark:text-gray-100"
                            />
                            <span className="text-xs text-gray-400">g</span>
                            <button
                                onClick={() => removeCookware(c.id)}
                                className="text-gray-300 dark:text-gray-600 hover:text-red-500 p-1"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {cookware.length === 0 && (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                    <Utensils className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
                    <p className="text-gray-400 dark:text-gray-500 text-sm">No hay utensilios configurados.</p>
                </div>
            )}
        </div>
    );
}
