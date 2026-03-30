import React from 'react';
import { ChefHat, Search, Plus, Trash2, Save, ChevronRight, Utensils, ArrowLeft, Sparkles, Mic, MicOff, AlertTriangle } from 'lucide-react';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
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
        ingredientWeightHistory, recipes,
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
        loadRecipe, deleteRecipe, mealHistory,
        setToast,
    } = state;

    const { isListening, isSupported, startListening, stopListening, error: voiceError } = useVoiceRecognition();

    const handleVoiceResult = React.useCallback((result: any) => {
        if (!result.ingredientName) return;

        // Find best matching ingredient
        const lowerSearched = result.ingredientName.toLowerCase();
        const matches = ingredients.filter(i => i.name.toLowerCase().includes(lowerSearched));

        if (matches.length > 0) {
            // Pick the first match or exact match if possible
            const exact = matches.find(i => i.name.toLowerCase() === lowerSearched) || matches[0];
            const weight = typeof result.amount === 'number' && !isNaN(result.amount) ? result.amount : undefined;
            addIngredientToRecipe(exact, weight);
            setToast(`Añadido por voz: ${exact.name} ${weight ? `(${weight}g)` : ''}`);
        } else {
            // Not found, launch creation UI
            setNewIngredientName(result.ingredientName);
            if (typeof result.amount === 'number' && !isNaN(result.amount)) {
                // If they dictated an amount, we could theoretically put it somewhere, but new form only asks for HC/100g.
                // We'll just pre-fill the name.
            }
            setShowAddIngredient(true);
            setSearchTerm('');
            setToast(`No se encontró "${result.ingredientName}". Puedes crearlo ahora.`);
        }
    }, [ingredients, addIngredientToRecipe, setToast, setNewIngredientName, setShowAddIngredient, setSearchTerm]);

    // Calculate effective carbs considering set-aside food
    const setAsideAmount = typeof setAsideValue === 'number' && setAsideValue > 0 ? setAsideValue : 0;
    const effectiveCarbsForDiabetics = setAsideMode === 'percentage'
        ? totalCarbs * (1 - setAsideAmount / 100)
        : setAsideMode === 'absolute' && totalCarbs > 0
            ? totalCarbs * (1 - setAsideAmount / (currentRecipeIngredients.reduce((sum, ri) => sum + ri.weight, 0) || 1))
            : totalCarbs;

    const suggestedIngredients = React.useMemo(() => {
        if (searchTerm) return [];

        const currentIds = currentRecipeIngredients.map(ri => ri.ingredientId);

        // 1. If currently building a recipe, find complementary ingredients (co-occurrence)
        if (currentRecipeIngredients.length > 0) {
            const coOccurringMap: Record<string, number> = {};

            recipes.forEach(r => {
                const rIds = r.ingredients.map(i => i.ingredientId);
                const intersection = rIds.filter(id => currentIds.includes(id));
                // Only count if this recipe shares ingredients but is not identical
                if (intersection.length > 0 && intersection.length < rIds.length) {
                    rIds.forEach(id => {
                        if (!currentIds.includes(id)) {
                            coOccurringMap[id] = (coOccurringMap[id] || 0) + 1;
                        }
                    });
                }
            });

            const sortedByCoOccurrence = Object.entries(coOccurringMap)
                .sort((a, b) => b[1] - a[1])
                .map(e => e[0])
                .slice(0, 8);

            if (sortedByCoOccurrence.length > 0) {
                return sortedByCoOccurrence
                    .map(id => ingredients.find(i => i.id === id))
                    .filter((i): i is NonNullable<typeof i> => !!i);
            }
        }

        // 2. Default: Most frequent recent ingredients
        let fallback = Object.entries(ingredientWeightHistory as Record<string, number[]>)
            .filter(([id]) => !currentIds.includes(id))
            .sort((a, b) => b[1].length - a[1].length)
            .map(e => e[0])
            .slice(0, 8)
            .map(id => ingredients.find(i => i.id === id))
            .filter((i): i is NonNullable<typeof i> => !!i);

        if (fallback.length === 0 && currentRecipeIngredients.length === 0) {
            // Hardcoded fallback for new users without history
            const defaultPopular = ['Aceite', 'Pan', 'Leche', 'Patata', 'Arroz', 'Huevo', 'Tomate', 'Manzana'];
            fallback = ingredients
                .filter(i => defaultPopular.some(name => i.name.toLowerCase().includes(name.toLowerCase())))
                .slice(0, 8);
            if (fallback.length === 0) fallback = ingredients.slice(0, 8);
        }

        return fallback;

    }, [searchTerm, currentRecipeIngredients, recipes, ingredientWeightHistory, ingredients]);

    const suggestedRecipes = React.useMemo(() => {
        if (cookingMode || recipeSearchTerm || recipes.length === 0) return { list: [], title: '' };

        const now = new Date();
        const hour = now.getHours();

        let timeSlot = '';
        let title = '';

        if (hour >= 6 && hour < 12) {
            timeSlot = 'desayuno';
            title = 'Sugerencias para desayunar';
        } else if (hour >= 12 && hour < 16) {
            timeSlot = 'almuerzo';
            title = 'Sugerencias para el almuerzo';
        } else if (hour >= 16 && hour < 20) {
            timeSlot = 'merienda';
            title = 'Sugerencias para merendar';
        } else {
            timeSlot = 'cena';
            title = 'Sugerencias para cenar';
        }

        // Filter history from the last year
        const oneYearAgo = now.getTime() - (365 * 24 * 60 * 60 * 1000);
        const recipeCounts: Record<string, number> = {};

        mealHistory.forEach(meal => {
            if (meal.timestamp > oneYearAgo && meal.recipeName) {
                const mealDate = new Date(meal.timestamp);
                const mHour = mealDate.getHours();

                let match = false;
                if (timeSlot === 'desayuno' && mHour >= 6 && mHour < 12) match = true;
                else if (timeSlot === 'almuerzo' && mHour >= 12 && mHour < 16) match = true;
                else if (timeSlot === 'merienda' && mHour >= 16 && mHour < 20) match = true;
                else if (timeSlot === 'cena' && (mHour >= 20 || mHour < 6)) match = true;

                if (match) {
                    recipeCounts[meal.recipeName] = (recipeCounts[meal.recipeName] || 0) + 1;
                }
            }
        });

        // Sort by frequency
        const sortedNames = Object.entries(recipeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0]);

        // Find matching saved recipes
        let matchedRecipes = sortedNames
            .map(name => recipes.find(r => r.name === name))
            .filter((r): r is NonNullable<typeof r> => !!r)
            .slice(0, 4);

        if (matchedRecipes.length === 0) {
            matchedRecipes = [...recipes].reverse().slice(0, 4);
            title = 'Tus últimas recetas';
        }

        return { list: matchedRecipes, title };

    }, [cookingMode, recipeSearchTerm, mealHistory, recipes]);

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
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-800 text-sm transition-colors dark:text-gray-100"
                        value={recipeSearchTerm}
                        onChange={(e) => setRecipeSearchTerm(e.target.value)}
                    />
                </div>

                {/* Recipe Suggestions */}
                {!recipeSearchTerm && suggestedRecipes.list.length > 0 && (
                    <div className="mb-4 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500 uppercase tracking-wider">
                            <Sparkles size={14} />
                            {suggestedRecipes.title}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {suggestedRecipes.list.map(recipe => (
                                <button
                                    key={`sug-${recipe.id}`}
                                    onClick={() => loadRecipe(recipe)}
                                    className="p-3 bg-orange-50/50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/50 rounded-xl text-left hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors shadow-sm active:scale-95"
                                >
                                    <div className="font-bold text-sm text-gray-800 dark:text-gray-200 line-clamp-1" title={recipe.name}>{recipe.name}</div>
                                    <div className="text-[10px] text-gray-500">{recipe.ingredients.length} ingr.</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
                <div className={`flex items-center bg-white dark:bg-gray-800 rounded-2xl p-1 border-2 shadow-sm transition-colors ${isListening ? 'border-red-400 dark:border-red-600 shadow-red-100 dark:shadow-red-900/30 ring-2 ring-red-100 dark:ring-red-900/40' : 'border-orange-200 dark:border-orange-800/60 focus-within:border-orange-400 dark:focus-within:border-orange-500'}`}>
                    <Search className={`${isListening ? 'text-red-400' : 'text-orange-400'} ml-3 transition-colors`} size={20} />
                    <input
                        type="text"
                        placeholder={isListening ? 'Escuchando... Di "Añadir 150 gramos de arroz"' : 'Buscar ingrediente para añadir...'}
                        className="w-full px-3 py-2.5 bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400 font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {isSupported && (
                        <button
                            onClick={() => {
                                if (isListening) {
                                    stopListening();
                                } else {
                                    startListening(handleVoiceResult);
                                }
                            }}
                            className={`p-2 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30'} mr-1`}
                            title="Añadir por voz"
                        >
                            {isListening ? <Mic size={18} /> : <MicOff size={18} />}
                        </button>
                    )}
                </div>
                {voiceError && (
                    <div className="text-xs text-red-500 px-2 mt-1">{voiceError}</div>
                )}
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
                            <div className="p-4 text-center">
                                <p className="text-gray-500 dark:text-gray-400 mb-3 text-sm">
                                    No se encontró "{searchTerm}"
                                </p>
                                <button
                                    onClick={() => {
                                        setNewIngredientName(searchTerm);
                                        setShowAddIngredient(true);
                                        setSearchTerm('');
                                    }}
                                    className="w-full py-2.5 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-orange-200 dark:hover:bg-orange-800/60 transition-colors"
                                >
                                    <Plus size={18} />
                                    Crear como nuevo
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Smart Suggestions */}
            {!searchTerm && suggestedIngredients.length > 0 && (
                <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-orange-500 uppercase tracking-wider">
                        <Sparkles size={14} />
                        Sugerencias rápidas
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {suggestedIngredients.map(ingredient => (
                            <button
                                key={`suggest-${ingredient.id}`}
                                onClick={() => addIngredientToRecipe(ingredient)}
                                className="px-3 py-1.5 bg-orange-50/80 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-full text-xs font-semibold border border-orange-200/50 dark:border-orange-800/50 shadow-sm hover:scale-105 transition-transform active:scale-95"
                            >
                                + {ingredient.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div>
                {!showAddIngredient ? (
                    <button
                        onClick={() => setShowAddIngredient(true)}
                        className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                    >
                        <Plus size={18} /> Crear ingrediente
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

                    const history = ingredientWeightHistory[ri.ingredientId] || [];
                    let isHighAmount = false;
                    if (history.length >= 3 && ri.weight > 250) {
                        const avg = history.reduce((a, b) => a + b, 0) / history.length;
                        if (ri.weight > avg * 2.5) isHighAmount = true;
                    }

                    return (
                        <motion.div
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={ri.ingredientId}
                            className={`flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border transition-colors ${isHighAmount ? 'border-yellow-300 dark:border-yellow-600' : 'border-gray-100 dark:border-gray-700'}`}
                        >
                            <div className="flex-1">
                                <div className="font-medium text-sm dark:text-gray-200">{ingredient.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{ingredient.carbsPer100g}g HC/100g</div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isHighAmount && (
                                    <div className="text-yellow-500 animate-pulse" title="Cantidad inusualmente alta respecto a tu historial">
                                        <AlertTriangle size={18} />
                                    </div>
                                )}
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
