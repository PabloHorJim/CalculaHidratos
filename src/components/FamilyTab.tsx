import React from 'react';
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { AppState } from '../hooks/useAppState';

interface FamilyTabProps {
    state: AppState;
}

export function FamilyTab({ state }: FamilyTabProps) {
    const { family, addFamilyMember, toggleFamilyMember, updateFamilyMember, removeFamilyMember } = state;

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-gray-800">Familia</h2>
                <button
                    onClick={addFamilyMember}
                    className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600"
                >
                    <Plus size={18} />
                </button>
            </div>
            <div className="space-y-2">
                {family.map(member => (
                    <div key={member.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                            <button onClick={() => toggleFamilyMember(member.id)}>
                                {member.isActive ? (
                                    <CheckCircle2 className="text-green-500" size={20} />
                                ) : (
                                    <Circle className="text-gray-300" size={20} />
                                )}
                            </button>
                            <input
                                type="text"
                                value={member.name}
                                onChange={(e) => updateFamilyMember(member.id, { name: e.target.value })}
                                className="flex-1 font-bold text-sm outline-none"
                            />
                            <button
                                onClick={() => removeFamilyMember(member.id)}
                                className="text-gray-300 hover:text-red-500"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Proporción</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={member.proportion}
                                    onChange={(e) => updateFamilyMember(member.id, { proportion: Number(e.target.value) })}
                                    className="w-full px-2 py-1 bg-gray-50 rounded text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                />
                            </div>
                            <div className="flex flex-col justify-end">
                                <button
                                    onClick={() => updateFamilyMember(member.id, { isDiabetic: !member.isDiabetic })}
                                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${member.isDiabetic ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
                                >
                                    {member.isDiabetic ? 'Diabético' : 'No Diabético'}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
