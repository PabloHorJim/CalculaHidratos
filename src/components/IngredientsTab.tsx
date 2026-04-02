import React, { useState, useMemo } from 'react';
import { Database, Search, Plus, Trash2, Edit2, CheckCircle2, Lock, X } from 'lucide-react';
import { AppState } from '../hooks/useAppState';
import { INITIAL_INGREDIENTS } from '../data/ingredients';

interface IngredientsTabProps {
    state: AppState;
}

export function IngredientsTab({ state }: IngredientsTabProps) {
    const { ingredients, createCustomIngredient, removeCustomIngredient, updateCustomIngredient } = state;

    const [searchTerm, setSearchTerm] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newCarbs, setNewCarbs] = useState<number | ''>('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editCarbs, setEditCarbs] = useState<number | ''>('');

    const filtered = useMemo(() => {
        return ingredients
            .filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [ingredients, searchTerm]);

    const handleCreate = () => {
        if (!newName || newCarbs === '') return;
        createCustomIngredient(newName, Number(newCarbs));
        setNewName('');
        setNewCarbs('');
        setShowAdd(false);
    };

    const handleSaveEdit = () => {
        if (!editingId || !editName || editCarbs === '') return;
        updateCustomIngredient(editingId, { name: editName, carbsPer100g: Number(editCarbs) });
        setEditingId(null);
    };

    const startEdit = (ing: any) => {
        setEditingId(ing.id);
        setEditName(ing.name);
        setEditCarbs(ing.carbsPer100g);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold flex items-center gap-2 dark:text-gray-100">
                    <Database className="text-orange-500" size={24} />
                    Base de Datos
                </h2>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="p-2 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded-xl font-bold flex items-center gap-1 text-sm hover:scale-105 transition-transform"
                >
                    {showAdd ? <X size={18} /> : <Plus size={18} />}
                    {showAdd ? 'Cerrar' : 'Nuevo'}
                </button>
            </div>

            {showAdd && (
                <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800 shadow-sm space-y-3 mb-4">
                    <div className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-2">Añadir Ingrediente Personalizado</div>
                    <input
                        type="text"
                        placeholder="Nombre del ingrediente"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 rounded-xl text-sm outline-none dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:border-orange-400"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                type="number"
                                placeholder="Hidratos por 100g"
                                className="w-full px-3 py-2 bg-white dark:bg-gray-800 rounded-xl text-sm outline-none dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:border-orange-400"
                                value={newCarbs}
                                onChange={(e) => setNewCarbs(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">g HC</span>
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={!newName || newCarbs === ''}
                            className="bg-orange-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Buscar ingredientes..."
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 text-sm transition-colors dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 text-[10px] font-black tracking-widest uppercase text-gray-400 flex justify-between">
                    <span>{filtered.length} Ingredientes</span>
                    <span>HC / 100g</span>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[60vh] overflow-y-auto">
                    {filtered.map(ing => {
                        const isOriginal = INITIAL_INGREDIENTS.some(i => i.id === ing.id);

                        if (editingId === ing.id) {
                            return (
                                <div key={ing.id} className="p-3 bg-orange-50/50 dark:bg-orange-900/10">
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-800 rounded-lg text-sm dark:text-white"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                        />
                                        <div className="relative w-24">
                                            <input
                                                type="number"
                                                className="w-full px-3 py-1.5 bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-800 rounded-lg text-sm dark:text-white"
                                                value={editCarbs}
                                                onChange={(e) => setEditCarbs(e.target.value === '' ? '' : Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 text-sm font-bold">
                                        <button onClick={() => setEditingId(null)} className="px-3 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
                                        <button onClick={handleSaveEdit} className="px-3 py-1 bg-orange-500 text-white rounded-lg flex items-center gap-1"><CheckCircle2 size={16} /> Guardar</button>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={ing.id} className="px-4 py-3 flex items-center justify-between group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div>
                                    <div className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                        {ing.name}
                                        {isOriginal && <Lock size={12} className="text-gray-300 dark:text-gray-600" title="Ingrediente Original del Sistema" />}
                                    </div>
                                    {!isOriginal && <div className="text-[10px] text-orange-500 font-bold">Personalizado</div>}
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="font-black text-gray-800 dark:text-gray-100">
                                        {ing.carbsPer100g} <span className="text-[10px] text-gray-400 font-normal">g</span>
                                    </div>

                                    {!isOriginal && (
                                        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEdit(ing)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => removeCustomIngredient(ing.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm font-medium">
                            No hay ingredientes que coincidan con la búsqueda.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
