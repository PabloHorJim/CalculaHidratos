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
                <h2 className="text-lg font-bold text-gray-800">Utensilios</h2>
                <button
                    onClick={addCookware}
                    className="p-1.5 bg-purple-500 text-white rounded-full hover:bg-purple-600"
                >
                    <Plus size={18} />
                </button>
            </div>
            <div className="space-y-2">
                {cookware.map(item => (
                    <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Utensils className="text-purple-500" size={18} />
                            <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateCookware(item.id, { name: e.target.value })}
                                className="flex-1 font-bold text-sm outline-none"
                            />
                            <button
                                onClick={() => removeCookware(item.id)}
                                className="text-gray-300 hover:text-red-500"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <div>
                            <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Masa (g)</label>
                            <input
                                type="number"
                                value={item.mass}
                                onChange={(e) => updateCookware(item.id, { mass: Number(e.target.value) })}
                                className="w-full px-2 py-1 bg-gray-50 rounded text-sm outline-none focus:ring-2 focus:ring-purple-200"
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
