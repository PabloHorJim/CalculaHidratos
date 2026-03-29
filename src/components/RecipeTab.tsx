import React from 'react';
import { ChefHat, Search, Plus, Trash2, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../hooks/useAppState';

interface RecipeTabProps {
    state: AppState;
}

export function RecipeTab({ state }: RecipeTabProps) {
    const {
        currentRecipeName, setCurrentRecipeName,
        currentRecipeIngredients,
        searchTerm, setSearchTerm,
        filteredIngredients,
        showAddIngredient, setShowAddIngredient,
        newIngredientName, setNewIngredientName,
        newIngredientCarbs, setNewIngredientCarbs,
        totalCarbs,
        editingRecipeId,
        diabeticMembers, activeFamilyProportionSum,
        setAsideMode, setAsideValue,
        ingredients,
        addIngredientToRecipe,
        createAndAddIngredient,
        updateIngredientWeight,
        removeIngredientFromRecipe,
        saveRecipe, saveAsNewRecipe, startNewRecipe,
    } = state;

    // Calculate effective carbs considering set-aside food
    const setAsideAmount = typeof setAsideValue === 'number' && setAsideValue > 0 ? setAsideValue : 0;
    const effectiveCarbsForDiabetics = setAsideMode === 'percentage'
        ? totalCarbs * (1 - setAsideAmount / 100)
        : setAsideMode === 'absolute' && totalCarbs > 0
            ? totalCarbs * (1 - setAsideAmount / (currentRecipeIngredients.reduce((sum, ri) => sum + ri.weight, 0) || 1))
            : totalCarbs;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-1">
                    <ChefHat className="text-orange-500" size={22} />
                    <input
                        type="text"
                        placeholder="Nombre (opcional para cálculo rápido)"
                        className="flex-1 text-lg font-semibold outline-none bg-transparent placeholder:text-gray-300"
                        value={currentRecipeName}
                        onChange={(e) => setCurrentRecipeName(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    {(currentRecipeName || currentRecipeIngredients.length > 0) && (
                        <button
                            onClick={startNewRecipe}
                            className="text-xs font-black uppercase px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-orange-100 hover:text-orange-600 transition-colors"
                        >
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Añadir ingrediente..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {filteredIngredients.map(i => (
                            <button
                                key={i.id}
                                onClick={() => addIngredientToRecipe(i)}
                                className="w-full px-4 py-3 text-left hover:bg-orange-50 flex justify-between items-center border-b border-gray-50 last:border-0"
                            >
                                <span className="font-medium">{i.name}</span>
                                <span className="text-xs text-gray-500">{i.carbsPer100g}g HC/100g</span>
                            </button>
                        ))}
                        {filteredIngredients.length === 0 && (
                            <div className="p-4 text-center text-gray-400 text-sm">
                                No se encontró "{searchTerm}"
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div>
                {!showAddIngredient ? (
                    <button
                        onClick={() => setShowAddIngredient(true)}
                        className="text-xs font-bold text-orange-500 flex items-center gap-1 hover:underline"
                    >
                        <Plus size={14} /> Ingrediente nuevo
                    </button>
                ) : (
                    <div className="bg-orange-50 p-3 rounded-xl space-y-2 border border-orange-100">
                        <input
                            type="text"
                            placeholder="Nombre"
                            className="w-full px-3 py-2 bg-white rounded-lg text-sm outline-none"
                            value={newIngredientName}
                            onChange={(e) => setNewIngredientName(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="HC/100g"
                                className="flex-1 px-3 py-2 bg-white rounded-lg text-sm outline-none"
                                value={newIngredientCarbs}
                                onChange={(e) => setNewIngredientCarbs(e.target.value === '' ? '' : Number(e.target.value))}
                            />
                            <button
                                onClick={createAndAddIngredient}
                                className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold"
                            >
                                Añadir
                            </button>
                            <button
                                onClick={() => setShowAddIngredient(false)}
                                className="text-gray-400 px-2"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {currentRecipeIngredients.map(ri => {
                    const ingredient = ingredients.find(i => i.id === ri.ingredientId);
                    if (!ingredient) return null;
                    return (
                        <motion.div
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={ri.ingredientId}
                            className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100"
                        >
                            <div className="flex-1">
                                <div className="font-medium text-sm">{ingredient.name}</div>
                                <div className="text-xs text-gray-500">{ingredient.carbsPer100g}g HC/100g</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={ri.weight}
                                    onChange={(e) => updateIngredientWeight(ri.ingredientId, Number(e.target.value))}
                                    className="w-20 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-right text-base outline-none focus:ring-2 focus:ring-orange-200"
                                />
                                <span className="text-sm text-gray-500">g</span>
                                <button
                                    onClick={() => removeIngredientFromRecipe(ri.ingredientId)}
                                    className="p-1.5 text-gray-400 hover:text-red-500"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {currentRecipeIngredients.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="mb-3">
                        <div className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Total Carbohidratos</div>
                        <div className="text-3xl font-black text-orange-600 leading-none">{totalCarbs.toFixed(1)} <span className="text-base font-normal">g HC</span></div>
                    </div>
                    {setAsideMode !== 'none' && setAsideAmount > 0 && (
                        <div className="mb-3 text-xs text-gray-400">
                            Tras apartar comida: <span className="font-bold text-orange-500">{effectiveCarbsForDiabetics.toFixed(1)}g HC</span>
                        </div>
                    )}
                    {diabeticMembers.length > 0 && (
                        <div className="flex flex-wrap gap-3 mb-3">
                            {diabeticMembers.map(dm => {
                                const dmCarbs = activeFamilyProportionSum > 0
                                    ? (dm.proportion / activeFamilyProportionSum) * effectiveCarbsForDiabetics
                                    : 0;
                                return (
                                    <div key={dm.id} className="bg-blue-50 px-3 py-2 rounded-xl border border-blue-100">
                                        <div className="text-xs text-blue-400 uppercase tracking-wider font-bold">Para {dm.name}</div>
                                        <div className="text-2xl font-black text-blue-600 leading-none">{dmCarbs.toFixed(1)} <span className="text-sm font-normal">g HC</span></div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <button
                                onClick={saveRecipe}
                                disabled={!currentRecipeName}
                                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-base ${currentRecipeName ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            >
                                <Save size={18} />
                                {editingRecipeId ? 'Actualizar' : 'Guardar'}
                            </button>
                            {editingRecipeId && (
                                <button
                                    onClick={saveAsNewRecipe}
                                    className="flex-1 py-3 bg-white border border-orange-200 text-orange-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-50 transition-colors text-base"
                                >
                                    <Plus size={18} />
                                    Como Nueva
                                </button>
                            )}
                        </div>
                        {!currentRecipeName && (
                            <div className="flex-1 flex items-center justify-center text-xs text-gray-400 font-medium text-center leading-tight">
                                Pon un nombre para guardar como receta
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
