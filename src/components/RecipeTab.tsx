import React from 'react';
import { ChefHat, Search, Plus, Trash2, Save, ChevronRight, Utensils, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../hooks/useAppState';

interface RecipeTabProps {
    state: AppState;
}

export function RecipeTab({ state }: RecipeTabProps) {
    const {
        cookingMode, setCookingMode,
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
        saveRecipe, saveAsNewRecipe, startNewRecipe, clearCookingState,
        filteredRecipes, recipeSearchTerm, setRecipeSearchTerm,
        loadRecipe, deleteRecipe,
    } = state;

    // Calculate effective carbs considering set-aside food
    const setAsideAmount = typeof setAsideValue === 'number' && setAsideValue > 0 ? setAsideValue : 0;
    const effectiveCarbsForDiabetics = setAsideMode === 'percentage'
        ? totalCarbs * (1 - setAsideAmount / 100)
        : setAsideMode === 'absolute' && totalCarbs > 0
            ? totalCarbs * (1 - setAsideAmount / (currentRecipeIngredients.reduce((sum, ri) => sum + ri.weight, 0) || 1))
            : totalCarbs;

    // ---- Saved Recipes View (default) ----
    if (!cookingMode) {
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <ChefHat className="text-orange-500" size={24} />
                        Recetas
                    </h2>
                </div>

                {/* Quick cook button */}
                <button
                    onClick={startNewRecipe}
                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl font-bold text-base shadow-lg shadow-orange-200 dark:shadow-orange-900/30 hover:shadow-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                    <Plus size={20} />
                    Cocinar sin receta
                </button>

                {/* Recipe search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar receta guardada..."
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 text-sm transition-colors"
                        value={recipeSearchTerm}
                        onChange={(e) => setRecipeSearchTerm(e.target.value)}
                    />
                </div>

                {/* Saved recipes list */}
                {filteredRecipes.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                        <Utensils className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
                        <p className="text-gray-400 dark:text-gray-500 text-sm">No se encontraron recetas.</p>
                        <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Pulsa "Cocinar sin receta" para empezar.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredRecipes.map(recipe => (
                            <div key={recipe.id} className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center transition-colors">
                                <button
                                    onClick={() => loadRecipe(recipe)}
                                    className="flex-1 text-left"
                                >
                                    <div className="font-bold text-sm text-gray-800 dark:text-gray-200">{recipe.name}</div>
                                    <div className="text-[10px] text-gray-400 dark:text-gray-500">{recipe.ingredients.length} ingredientes</div>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => loadRecipe(recipe)}
                                        className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <button
                                        onClick={() => deleteRecipe(recipe.id)}
                                        className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 rounded-lg"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Resume cooking button (if there's an active recipe) */}
                {currentRecipeIngredients.length > 0 && (
                    <button
                        onClick={() => setCookingMode(true)}
                        className="w-full py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-sm border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-2"
                    >
                        <ChefHat size={18} />
                        Continuar cocinando{currentRecipeName ? `: ${currentRecipeName}` : ''}
                    </button>
                )}
            </div>
        );
    }

    // ---- Cooking Mode (ingredient builder) ----
    return (
        <div className="space-y-4">
            {/* Header: Back & Clear */}
            <div className="flex items-center justify-between mb-2">
                <button
                    onClick={() => setCookingMode(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm shadow-sm border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    <ArrowLeft size={16} className="text-gray-400" />
                    Volver a Recetas
                </button>
                {(currentRecipeName || currentRecipeIngredients.length > 0) && (
                    <button
                        onClick={clearCookingState}
                        className="text-xs font-black uppercase px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    >
                        Limpiar todo
                    </button>
                )}
            </div>

            {/* Recipe Name Input Box */}
            <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900/40 flex items-center gap-3">
                <div className="bg-orange-100 dark:bg-orange-900/50 p-2.5 rounded-xl text-orange-500">
                    <ChefHat size={22} />
                </div>
                <input
                    type="text"
                    placeholder="Nombre de la receta (opcional)"
                    className="flex-1 text-lg font-black outline-none bg-transparent placeholder:text-gray-300 dark:placeholder:text-gray-600 dark:text-gray-100"
                    value={currentRecipeName}
                    onChange={(e) => setCurrentRecipeName(e.target.value)}
                />
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Añadir ingrediente..."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 text-sm transition-colors dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {filteredIngredients.map(i => (
                            <button
                                key={i.id}
                                onClick={() => addIngredientToRecipe(i)}
                                className="w-full px-4 py-3 text-left hover:bg-orange-50 dark:hover:bg-orange-900/20 flex justify-between items-center border-b border-gray-50 dark:border-gray-700 last:border-0"
                            >
                                <span className="font-medium dark:text-gray-200">{i.name}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{i.carbsPer100g}g HC/100g</span>
                            </button>
                        ))}
                        {filteredIngredients.length === 0 && (
                            <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-sm">
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
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl space-y-2 border border-orange-100 dark:border-orange-800">
                        <input
                            type="text"
                            placeholder="Nombre"
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none dark:text-gray-100"
                            value={newIngredientName}
                            onChange={(e) => setNewIngredientName(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="HC/100g"
                                className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg text-sm outline-none dark:text-gray-100"
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
                            className="flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors"
                        >
                            <div className="flex-1">
                                <div className="font-medium text-sm dark:text-gray-200">{ingredient.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{ingredient.carbsPer100g}g HC/100g</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={ri.weight}
                                    onChange={(e) => updateIngredientWeight(ri.ingredientId, Number(e.target.value))}
                                    className="w-20 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-right text-base outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 dark:text-gray-100"
                                />
                                <span className="text-sm text-gray-500 dark:text-gray-400">g</span>
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
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="mb-3">
                        <div className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-1">Total Carbohidratos</div>
                        <div className="text-3xl font-black text-orange-600 dark:text-orange-400 leading-none">{totalCarbs.toFixed(1)} <span className="text-base font-normal">g HC</span></div>
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
                                    <div key={dm.id} className="bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-800">
                                        <div className="text-xs text-blue-400 uppercase tracking-wider font-bold">Para {dm.name}</div>
                                        <div className="text-2xl font-black text-blue-600 dark:text-blue-400 leading-none">{dmCarbs.toFixed(1)} <span className="text-sm font-normal">g HC</span></div>
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
                                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-base ${currentRecipeName ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
                            >
                                <Save size={18} />
                                {editingRecipeId ? 'Actualizar' : 'Guardar'}
                            </button>
                            {editingRecipeId && (
                                <button
                                    onClick={saveAsNewRecipe}
                                    className="flex-1 py-3 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 text-orange-500 dark:text-orange-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-base"
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
