import React from 'react';
import { Plus, Trash2, ChevronRight, Search, Utensils } from 'lucide-react';
import { AppState } from '../hooks/useAppState';

interface SavedRecipesTabProps {
    state: AppState;
}

export function SavedRecipesTab({ state }: SavedRecipesTabProps) {
    const { filteredRecipes, recipeSearchTerm, setRecipeSearchTerm, startNewRecipe, loadRecipe, deleteRecipe } = state;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold text-gray-800">Recetas Guardadas</h2>
                <button
                    onClick={startNewRecipe}
                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                    <Plus size={14} /> Nueva
                </button>
            </div>

            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Buscar receta guardada..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                    value={recipeSearchTerm}
                    onChange={(e) => setRecipeSearchTerm(e.target.value)}
                />
            </div>

            {filteredRecipes.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                    <Utensils className="mx-auto text-gray-300 mb-3" size={48} />
                    <p className="text-gray-400 text-sm">No se encontraron recetas.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredRecipes.map(recipe => (
                        <div key={recipe.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                            <button
                                onClick={() => loadRecipe(recipe)}
                                className="flex-1 text-left"
                            >
                                <div className="font-bold text-sm text-gray-800">{recipe.name}</div>
                                <div className="text-[10px] text-gray-400">{recipe.ingredients.length} ingredientes</div>
                            </button>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => loadRecipe(recipe)}
                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                                >
                                    <ChevronRight size={18} />
                                </button>
                                <button
                                    onClick={() => deleteRecipe(recipe.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
