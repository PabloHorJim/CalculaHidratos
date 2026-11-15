import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Ingredient, Recipe, RecipeIngredient, FamilyMember, Cookware, MealHistoryEntry, FamilyGroup } from '../types';
import { INITIAL_INGREDIENTS } from '../data/ingredients';
import { getMealSlot } from '../utils/dateUtils';
import { sortHistory, upsertHistory, HISTORY_WINDOW } from '../utils/history';
import { computeSplit, memberFraction } from '../utils/split';
import { IngredientExtra, cleanExtra, withExtras, ingredientCarbs, recipeMacros, scaleIngredients } from '../utils/nutrition';
import { useCloudSync, clearSyncBase, SHARED_BASE_KEY, SyncField, SyncStatus } from './useCloudSync';
import { useCollectionSync } from './useCollectionSync';
import { useConsent } from './useConsent';
import { useInstallPrompt } from './useInstallPrompt';
import { useSession, LOCAL_STATE_KEY } from './useSession';
import { PATIENT_BASE_KEY } from './usePatientState';
import { copyText, portionMessage, fullMealMessage, sharePortionOnWhatsApp, shareFullMealOnWhatsApp, shareDiabeticCarbsOnWhatsApp } from '../utils/share';
import { mealsToCsv, downloadFile } from '../utils/exportData';
import { db, doc, setDoc, collection, getDocs, query, orderBy } from '../firebase';
import { notifyFamily } from '../push';
import { loadPrefs } from './usePrefs';

const STORAGE_KEY = LOCAL_STATE_KEY;
const HISTORY_BASE_KEY = 'carb_calc_sync_base_meals';
const COOKING_STATE_KEY = 'carb_calc_cooking';
const TUTORIAL_KEY = 'carbcalc_tutorial_done';

export type TabType = 'recipe' | 'split' | 'family' | 'cookware' | 'ingredients' | 'history' | 'stats' | 'legal' | 'dose' | 'patient' | 'quick' | 'settings';

// Ordered tabs for swipe navigation (main nav bar tabs only)
export const MAIN_TABS: TabType[] = ['recipe', 'split', 'quick', 'family'];
export const PATIENT_TABS: TabType[] = ['recipe', 'split', 'quick', 'dose', 'family'];

type Portion = MealHistoryEntry['portions'][number];

/** Shared data kept as fields of one Firestore document (the meal history has its own collection). */
interface SyncedState extends Record<string, unknown> {
    customIngredients: Ingredient[];
    recipes: Recipe[];
    family: FamilyMember[];
    cookware: Cookware[];
    ingredientWeightHistory: Record<string, number[]>;
    ingredientExtras: Record<string, IngredientExtra>;
    currentRecipeName: string;
    currentRecipeIngredients: RecipeIngredient[];
    cookingMode: boolean;
}

const asArray = (v: unknown) => (Array.isArray(v) ? v : []);

const SYNC_FIELDS: { [K in keyof SyncedState]: SyncField } = {
    customIngredients: { key: 'id', normalize: asArray },
    recipes: { key: 'id', normalize: asArray },
    family: { key: 'id', normalize: asArray },
    cookware: { key: 'id', normalize: asArray },
    ingredientWeightHistory: { normalize: v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) },
    ingredientExtras: { normalize: v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) },
    currentRecipeName: { normalize: v => (typeof v === 'string' ? v : '') },
    currentRecipeIngredients: { key: 'ingredientId', normalize: asArray },
    cookingMode: { normalize: v => !!v }
};

export function useAppState() {
    // --- State ---
    const [activeTab, setActiveTab] = useState<TabType>('recipe');
    const [customIngredients, setCustomIngredients] = useState<Ingredient[]>([]);

    // Pieces and raw->cooked factors the family has set for built-in ingredients
    const [ingredientExtras, setIngredientExtras] = useState<Record<string, IngredientExtra>>({});

    const ingredients = useMemo(() => {
        return [...INITIAL_INGREDIENTS, ...customIngredients].map(i => withExtras(i, ingredientExtras));
    }, [customIngredients, ingredientExtras]);
    const ingredientById = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [family, setFamily] = useState<FamilyMember[]>([
        { id: '1', name: 'Persona 1', proportion: 1, isDiabetic: true, isActive: true },
        { id: '2', name: 'Persona 2', proportion: 1, isDiabetic: false, isActive: true }
    ]);
    const [cookware, setCookware] = useState<Cookware[]>([
        { id: '1', name: 'Olla Grande', mass: 1200 },
        { id: '2', name: 'Sartén Mediana', mass: 800 }
    ]);
    const [mealHistory, setMealHistory] = useState<MealHistoryEntry[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);

    const { hasConsent, needsConsentPrompt, acceptConsent, declineCloudConsent } = useConsent();
    const { isInstallable, handleInstallClick } = useInstallPrompt();

    // Recipe Builder State
    const [cookingMode, setCookingMode] = useState(false);
    const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
    const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
    const [editingHistoryName, setEditingHistoryName] = useState('');
    const [currentRecipeName, setCurrentRecipeName] = useState('');
    const [currentRecipeIngredients, setCurrentRecipeIngredients] = useState<RecipeIngredient[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [recipeSearchTerm, setRecipeSearchTerm] = useState('');
    const [showAddIngredient, setShowAddIngredient] = useState(false);
    const [newIngredientName, setNewIngredientName] = useState('');
    const [newIngredientCarbs, setNewIngredientCarbs] = useState<number | ''>('');
    const [newIngredientCategory, setNewIngredientCategory] = useState('');
    const [inviteInput, setInviteInput] = useState('');
    const invitePrefilled = useRef(false);
    const [groupNameInput, setGroupNameInput] = useState('');

    // Split Calculation State
    const [selectedCookwareId, setSelectedCookwareId] = useState('');
    const [totalWeightWithCookware, setTotalWeightWithCookware] = useState<number | ''>('');
    const [cachedTotalCarbs, setCachedTotalCarbs] = useState(0);
    const [cachedRecipeName, setCachedRecipeName] = useState('');
    const [setAsideMode, setSetAsideMode] = useState<'none' | 'percentage' | 'absolute'>('none');
    const [setAsideValue, setSetAsideValue] = useState<number | ''>('');
    const [portionErrorPercent, setPortionErrorPercent] = useState(0);
    const [isErrorDisabledForCurrentSplit, setIsErrorDisabledForCurrentSplit] = useState(false);
    const [isBatchCooking, setIsBatchCooking] = useState(false);

    // Adaptive ingredient weights
    const [ingredientWeightHistory, setIngredientWeightHistory] = useState<Record<string, number[]>>({});

    // Dark mode — follow system preference, no manual toggle
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = (dark: boolean) => {
            if (dark) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        };
        apply(mq.matches);
        const handler = (e: MediaQueryListEvent) => apply(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Check if tutorial should be shown
    useEffect(() => {
        if (isLoaded && !localStorage.getItem(TUTORIAL_KEY)) {
            setShowTutorial(true);
        }
    }, [isLoaded]);

    const dismissTutorial = () => {
        setShowTutorial(false);
        localStorage.setItem(TUTORIAL_KEY, 'true');
    };

    // Load initial data from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        let loadedMealHistory: MealHistoryEntry[] = [];
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.customIngredients)) setCustomIngredients(parsed.customIngredients);
                if (Array.isArray(parsed.recipes)) setRecipes(parsed.recipes);
                if (Array.isArray(parsed.family)) setFamily(parsed.family);
                if (Array.isArray(parsed.cookware)) setCookware(parsed.cookware);
                if (Array.isArray(parsed.mealHistory)) {
                    loadedMealHistory = sortHistory(parsed.mealHistory);
                    setMealHistory(loadedMealHistory);
                }
                if (typeof parsed.portionErrorPercent === 'number') setPortionErrorPercent(parsed.portionErrorPercent);
                if (parsed.ingredientWeightHistory) setIngredientWeightHistory(parsed.ingredientWeightHistory);
                if (parsed.ingredientExtras && typeof parsed.ingredientExtras === 'object') setIngredientExtras(parsed.ingredientExtras);
            } catch (e) {
                console.error('Failed to load state', e);
            }
        }

        // Load cooking/split state separately (persists across refreshes)
        const cookingSaved = localStorage.getItem(COOKING_STATE_KEY);
        if (cookingSaved) {
            try {
                const parsed = JSON.parse(cookingSaved);

                // Auto-clear session if the cached recipe was already saved in a different meal slot
                const cachedName: string = parsed.cachedRecipeName || '';
                const shouldAutoClear = (() => {
                    if (!cachedName) return false;
                    const currentSlot = getMealSlot(new Date().getHours());
                    // History is sorted newest first: this is the most recent entry for the recipe
                    const lastEntry = loadedMealHistory.find(m => m.recipeName === cachedName);
                    if (!lastEntry) return false;
                    const entryDate = new Date(lastEntry.timestamp);
                    const isOtherDay = entryDate.toDateString() !== new Date().toDateString();
                    return isOtherDay || getMealSlot(entryDate.getHours()) !== currentSlot;
                })();

                if (shouldAutoClear) {
                    // Clear the persisted cooking state too
                    localStorage.removeItem(COOKING_STATE_KEY);
                } else {
                    if (parsed.currentRecipeName) setCurrentRecipeName(parsed.currentRecipeName);
                    if (parsed.currentRecipeIngredients) setCurrentRecipeIngredients(parsed.currentRecipeIngredients);
                    if (parsed.editingRecipeId) setEditingRecipeId(parsed.editingRecipeId);
                    if (parsed.cookingMode) setCookingMode(parsed.cookingMode);
                    if (parsed.selectedCookwareId) setSelectedCookwareId(parsed.selectedCookwareId);
                    if (typeof parsed.totalWeightWithCookware === 'number') setTotalWeightWithCookware(parsed.totalWeightWithCookware);
                    if (typeof parsed.cachedTotalCarbs === 'number') setCachedTotalCarbs(parsed.cachedTotalCarbs);
                    if (parsed.cachedRecipeName) setCachedRecipeName(parsed.cachedRecipeName);
                    if (parsed.setAsideMode) setSetAsideMode(parsed.setAsideMode);
                    if (typeof parsed.setAsideValue === 'number') setSetAsideValue(parsed.setAsideValue);
                    if (parsed.isBatchCooking) setIsBatchCooking(true);
                }
            } catch (e) {
                console.error('Failed to load cooking state', e);
            }
        }

        setIsLoaded(true);
    }, []);

    // Save cooking/split state to localStorage whenever it changes
    useEffect(() => {
        if (!isLoaded) return;
        const cookingState = {
            currentRecipeName,
            currentRecipeIngredients,
            editingRecipeId,
            cookingMode,
            selectedCookwareId,
            totalWeightWithCookware,
            cachedTotalCarbs,
            cachedRecipeName,
            setAsideMode,
            setAsideValue,
            isBatchCooking,
        };
        localStorage.setItem(COOKING_STATE_KEY, JSON.stringify(cookingState));
    }, [currentRecipeName, currentRecipeIngredients, editingRecipeId, cookingMode,
        selectedCookwareId, totalWeightWithCookware, cachedTotalCarbs, cachedRecipeName,
        setAsideMode, setAsideValue, isBatchCooking, isLoaded]);

    // ---- Session, group and cloud sync ----
    // Latest shared data, for handlers that must not be re-created on every change
    const seedRef = useRef<() => Record<string, unknown>>(() => ({}));
    const session = useSession({
        isLoaded,
        hasConsent,
        acceptConsent,
        setToast,
        getGroupSeed: () => seedRef.current(),
        // Also forget the sensor connection: it belongs to whoever was signed in
        onSignedOut: () => clearSyncBase(SHARED_BASE_KEY, HISTORY_BASE_KEY, PATIENT_BASE_KEY, 'carbcalc_glucose', 'carbcalc_push_device')
    });
    const { user, isAuthReady, groupId, familyGroup, groupMembers, syncDocPath } = session;

    const syncedState = useMemo<SyncedState>(() => ({
        customIngredients, recipes, family, cookware, ingredientWeightHistory, ingredientExtras,
        currentRecipeName, currentRecipeIngredients, cookingMode
    }), [customIngredients, recipes, family, cookware, ingredientWeightHistory, ingredientExtras,
        currentRecipeName, currentRecipeIngredients, cookingMode]);
    seedRef.current = () => ({ customIngredients, recipes, family, cookware, ingredientWeightHistory, ingredientExtras });

    const applyRemoteChanges = useCallback((patch: Partial<SyncedState>) => {
        if (patch.customIngredients !== undefined) setCustomIngredients(patch.customIngredients);
        if (patch.recipes !== undefined) setRecipes(patch.recipes);
        if (patch.family !== undefined) setFamily(patch.family);
        if (patch.cookware !== undefined) setCookware(patch.cookware);
        if (patch.ingredientWeightHistory !== undefined) setIngredientWeightHistory(patch.ingredientWeightHistory);
        if (patch.ingredientExtras !== undefined) setIngredientExtras(patch.ingredientExtras);
        if (patch.currentRecipeName !== undefined) setCurrentRecipeName(patch.currentRecipeName);
        if (patch.currentRecipeIngredients !== undefined) setCurrentRecipeIngredients(patch.currentRecipeIngredients);
        if (patch.cookingMode !== undefined) setCookingMode(patch.cookingMode);
    }, []);

    // Meal history used to be a field of the shared document. `historyParent` records, for
    // the document currently synced, whether its meals have already been moved to the
    // "meals" collection and, if not, the old list that still has to be moved.
    const [historyParent, setHistoryParent] = useState<{ path: string; migrated: boolean; legacy: MealHistoryEntry[] } | null>(null);
    const { handleRemoteDocument: handleGroupDocument, handleSyncError } = session;
    const handleRemoteDocument = useCallback((path: string, data: Record<string, unknown> | null, fromCache: boolean) => {
        handleGroupDocument(path, data);
        const migrated = data?.historyMigrated === true;
        // "Not migrated yet" is only believed when the server says so: an old cached copy
        // would make this device upload meals that were deleted after the migration.
        if (fromCache && !migrated) return;
        setHistoryParent(prev => {
            if (prev && prev.path === path && prev.migrated === migrated) return prev;
            const legacy = !migrated && Array.isArray(data?.mealHistory) ? (data.mealHistory as MealHistoryEntry[]) : [];
            return { path, migrated, legacy };
        });
    }, [handleGroupDocument]);

    const syncExtra = useMemo(() => (groupId || !user ? undefined : { uid: user.uid }), [groupId, user]);

    const { status: documentStatus } = useCloudSync<SyncedState>({
        docPath: syncDocPath,
        local: syncedState,
        fields: SYNC_FIELDS,
        apply: applyRemoteChanges,
        onRemoteDocument: handleRemoteDocument,
        onError: handleSyncError,
        extraOnWrite: syncExtra,
        createIfMissing: !groupId
    });

    const historyReady = !!syncDocPath && historyParent?.path === syncDocPath;
    const markHistoryMigrated = useCallback(() => {
        if (!syncDocPath) return;
        setDoc(doc(db, syncDocPath), { historyMigrated: true, ...(syncExtra ?? {}) }, { merge: true })
            .catch(err => console.error('Could not record the history migration', err?.code || err));
    }, [syncDocPath, syncExtra]);

    const { status: historyStatus } = useCollectionSync<MealHistoryEntry>({
        collectionPath: historyReady ? `${syncDocPath}/meals` : null,
        local: mealHistory,
        apply: setMealHistory,
        normalize: sortHistory,
        orderField: 'timestamp',
        windowSize: HISTORY_WINDOW,
        storageKey: HISTORY_BASE_KEY,
        seed: historyReady && historyParent && !historyParent.migrated ? historyParent.legacy : null,
        onSeeded: markHistoryMigrated,
        onError: handleSyncError
    });

    // One status for the header: the worse of the two
    const syncStatus: SyncStatus = (() => {
        if (documentStatus === 'off') return user && hasConsent ? 'connecting' : 'off';
        const order: SyncStatus[] = ['error', 'offline', 'connecting', 'saving', 'synced'];
        const history = historyStatus === 'off' ? 'connecting' : historyStatus;
        return order.find(s => s === documentStatus || s === history) ?? documentStatus;
    })();

    // Save shared data to localStorage immediately (the cloud copy is handled by useCloudSync)
    useEffect(() => {
        if (!isLoaded) return;
        const state = { customIngredients, recipes, family, cookware, mealHistory, groupId, portionErrorPercent, ingredientWeightHistory, ingredientExtras };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('Failed to save state locally', e);
        }
    }, [customIngredients, recipes, family, cookware, mealHistory, groupId, portionErrorPercent, ingredientWeightHistory, ingredientExtras, isLoaded]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // --- Computed Values ---
    const filteredIngredients = useMemo(() => {
        return ingredients.filter(i =>
            i.name.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [ingredients, searchTerm]);

    const recipeTotals = useMemo(
        () => recipeMacros(currentRecipeIngredients, id => ingredientById.get(id)),
        [currentRecipeIngredients, ingredientById]
    );
    const totalCarbs = recipeTotals.carbs;

    // Cache totalCarbs and recipeName for the split tab (persists after recipe save/clear)
    useEffect(() => {
        if (totalCarbs > 0) setCachedTotalCarbs(totalCarbs);
    }, [totalCarbs]);

    useEffect(() => {
        if (currentRecipeName) setCachedRecipeName(currentRecipeName);
    }, [currentRecipeName]);

    const activeFamilyProportionSum = useMemo(() => {
        return family.filter(m => m.isActive).reduce((sum, m) => sum + m.proportion, 0);
    }, [family]);

    const diabeticMembers = useMemo(() => {
        return family.filter(m => m.isDiabetic && m.isActive);
    }, [family]);

    // Shared "reparto" maths (cooked weight, food set aside, carbs actually served)
    const selectedCookware = cookware.find(c => c.id === selectedCookwareId);
    const cookwareMass = selectedCookwareId === 'none' ? 0 : (selectedCookware ? selectedCookware.mass : null);
    const effectiveCarbs = totalCarbs > 0 ? totalCarbs : cachedTotalCarbs;
    const split = useMemo(() => computeSplit({
        totalWeight: totalWeightWithCookware,
        cookwareMass,
        setAsideMode,
        setAsideValue,
        totalCarbs: effectiveCarbs,
        rawIngredientWeight: currentRecipeIngredients.reduce((sum, ri) => sum + (Number(ri.weight) || 0), 0)
    }), [totalWeightWithCookware, cookwareMass, setAsideMode, setAsideValue, effectiveCarbs, currentRecipeIngredients]);

    /** Carbohydrates a member gets from the food being shared out. */
    const getMemberCarbs = useCallback((member: FamilyMember) => {
        return memberFraction(member, family) * split.adjustedCarbs;
    }, [family, split.adjustedCarbs]);

    const filteredRecipes = useMemo(() => {
        return recipes.filter(r =>
            r.name.toLowerCase().includes(recipeSearchTerm.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [recipes, recipeSearchTerm]);

    // --- Helpers ---
    const getAdaptiveWeight = useCallback((ingredientId: string): number => {
        const history = ingredientWeightHistory[ingredientId];
        if (!history || history.length === 0) return 100;
        const sorted = [...history].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
        return Math.max(25, Math.round(median / 25) * 25);
    }, [ingredientWeightHistory]);

    const recordIngredientWeight = useCallback((ingredientId: string, weight: number) => {
        setIngredientWeightHistory(prev => {
            const existing = prev[ingredientId] || [];
            const updated = [...existing, weight].slice(-7); // Keep last 7
            return { ...prev, [ingredientId]: updated };
        });
    }, []);

    // --- Handlers ---
    const addIngredientToRecipe = (ingredient: Ingredient, initialWeight?: number) => {
        const defaultWeight = initialWeight !== undefined ? initialWeight : getAdaptiveWeight(ingredient.id);
        setCurrentRecipeIngredients(prev => {
            const existing = prev.find(ri => ri.ingredientId === ingredient.id);
            if (!existing) return [...prev, { ingredientId: ingredient.id, weight: defaultWeight }];
            // Already in the recipe: an explicit amount (voice) replaces the weight
            if (initialWeight === undefined) return prev;
            return prev.map(ri => ri.ingredientId === ingredient.id ? { ...ri, weight: initialWeight } : ri);
        });
        setSearchTerm('');
    };

    /** Creates a custom ingredient; returns the existing one when the name is already taken. */
    const createCustomIngredient = (rawName: string, rawCarbs: number | '', rawCategory = ''): { ingredient: Ingredient; created: boolean } | null => {
        const name = rawName.trim();
        const carbs = Number(rawCarbs);
        if (!name || rawCarbs === '') return null;
        if (!Number.isFinite(carbs) || carbs < 0 || carbs > 100) {
            setToast('Los HC por 100g deben estar entre 0 y 100');
            return null;
        }
        const duplicate = ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (duplicate) return { ingredient: duplicate, created: false };
        const category = rawCategory.trim();
        const newIngredient: Ingredient = {
            // "c" prefix: never clashes with the numeric ids of the built-in list
            id: `c${Date.now()}`,
            name,
            carbsPer100g: carbs,
            ...(category ? { category } : {})
        };
        setCustomIngredients(prev => [...prev, newIngredient]);
        return { ingredient: newIngredient, created: true };
    };

    const createAndAddIngredient = () => {
        const result = createCustomIngredient(newIngredientName, newIngredientCarbs, newIngredientCategory);
        if (!result) return;
        addIngredientToRecipe(result.ingredient);
        setNewIngredientName('');
        setNewIngredientCarbs('');
        setNewIngredientCategory('');
        setShowAddIngredient(false);
        setToast(result.created ? 'Ingrediente creado y añadido' : `"${result.ingredient.name}" ya existía: añadido a la receta`);
    };

    const updateCustomIngredient = (id: string, updates: Partial<Omit<Ingredient, 'id'>>) => {
        setCustomIngredients(prev => prev.map(i => {
            if (i.id !== id) return i;
            const next = { ...i, ...updates };
            if (!next.category) delete next.category;
            return next;
        }));
    };

    const removeCustomIngredient = (id: string) => {
        const ingredient = customIngredients.find(i => i.id === id);
        if (!ingredient) return;
        const usedIn = recipes.filter(r => r.ingredients.some(ri => ri.ingredientId === id)).length;
        const warning = usedIn > 0
            ? `\n\nSe usa en ${usedIn} receta${usedIn === 1 ? '' : 's'}: dejará de contar carbohidratos en ellas hasta que lo sustituyas.`
            : '';
        if (!window.confirm(`¿Eliminar el ingrediente "${ingredient.name}"?${warning}`)) return;
        setCustomIngredients(prev => prev.filter(i => i.id !== id));
        setToast('Ingrediente eliminado');
    };

    const updateIngredientWeight = (id: string, weight: number) => {
        setCurrentRecipeIngredients(prev =>
            prev.map(ri => ri.ingredientId === id ? { ...ri, weight } : ri)
        );
    };

    const setIngredientCooked = (id: string, cooked: boolean) => {
        setCurrentRecipeIngredients(prev => prev.map(ri => {
            if (ri.ingredientId !== id) return ri;
            const { cooked: _old, ...rest } = ri;
            return cooked ? { ...rest, cooked: true } : rest;
        }));
    };

    /** "For 6 instead of 4": multiplies every weight of the recipe being cooked. */
    const scaleCurrentRecipe = (factor: number) => {
        if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
        setCurrentRecipeIngredients(prev => scaleIngredients(prev, factor));
        setToast(`Cantidades multiplicadas por ${String(Math.round(factor * 100) / 100).replace('.', ',')}`);
    };

    /** Pieces, raw->cooked factor, fat and protein of any ingredient (built-in or custom). */
    const updateIngredientExtra = (id: string, updates: Partial<IngredientExtra>) => {
        setIngredientExtras(prev => {
            const merged: Record<string, unknown> = { ...prev[id], ...updates };
            // 0 or empty is stored as such: it switches a built-in default off
            for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
            const cleaned: Record<string, unknown> = { ...cleanExtra(merged) };
            for (const key of ['unitWeight', 'cookedFactor'] as const) if (merged[key] === 0) cleaned[key] = 0;
            return { ...prev, [id]: cleaned as IngredientExtra };
        });
    };

    /** Something one person eats on their own (fruit, a snack...): goes straight to the history. */
    const saveQuickMeal = (memberId: string, name: string, items: RecipeIngredient[], extraCarbs: number) => {
        const member = family.find(m => m.id === memberId);
        if (!member) return false;
        const totals = recipeMacros(items, id => ingredientById.get(id));
        const carbs = totals.carbs + Math.max(0, extraCarbs || 0);
        const weight = items.reduce((sum, ri) => sum + (Number(ri.weight) || 0), 0);
        if (carbs <= 0 && weight <= 0) return false;
        const now = new Date();
        const entry: MealHistoryEntry = {
            id: now.getTime().toString(),
            timestamp: now.toISOString(),
            recipeName: name.trim() || items.map(ri => ingredientById.get(ri.ingredientId)?.name).filter(Boolean).join(', ') || 'Picoteo',
            totalCarbs: carbs,
            netWeight: weight,
            kind: 'single',
            ...(totals.complete && extraCarbs <= 0 ? { totalFat: totals.fat, totalProtein: totals.protein } : {}),
            portions: [{ memberId: member.id, memberName: member.name, weight, carbs, isDiabetic: member.isDiabetic }]
        };
        setMealHistory(prev => sortHistory([entry, ...prev]));
        items.forEach(ri => { if (!ri.cooked) recordIngredientWeight(ri.ingredientId, ri.weight); });
        setToast(`Guardado: ${carbs.toFixed(1)} g HC para ${member.name}`);
        announceMeal(`${entry.recipeName} para ${member.name}`, `${carbs.toFixed(1)} g HC`);
        return true;
    };

    const removeIngredientFromRecipe = (id: string) => {
        setCurrentRecipeIngredients(prev => prev.filter(ri => ri.ingredientId !== id));
    };

    const saveRecipe = () => {
        if (!currentRecipeName || currentRecipeIngredients.length === 0) return;

        const recipeData = {
            name: currentRecipeName,
            ingredients: [...currentRecipeIngredients]
        };

        // Record weights for adaptive defaults
        currentRecipeIngredients.forEach(ri => {
            recordIngredientWeight(ri.ingredientId, ri.weight);
        });

        const computedCarbs = totalCarbs;

        if (editingRecipeId) {
            setRecipes(prev => prev.map(r =>
                r.id === editingRecipeId ? { ...r, ...recipeData } : r
            ));
            setToast('Receta actualizada');
        } else {
            const newRecipe: Recipe = {
                id: Date.now().toString(),
                ...recipeData
            };
            setRecipes(prev => [...prev, newRecipe]);
            setEditingRecipeId(newRecipe.id);
            setToast('Receta guardada');
        }

        // Create/update a preliminary history entry (keeps the split of a recent entry, if any)
        if (computedCarbs > 0) {
            setMealHistory(prev => upsertHistory(prev, { recipeName: currentRecipeName, totalCarbs: computedCarbs }));
        }

        // Do NOT clear recipe data — user explicitly requested this
        // Stay in cooking mode, do NOT switch tabs
    };

    const saveAsNewRecipe = () => {
        if (!currentRecipeName || currentRecipeIngredients.length === 0) return;

        // Record weights for adaptive defaults
        currentRecipeIngredients.forEach(ri => {
            recordIngredientWeight(ri.ingredientId, ri.weight);
        });

        const computedCarbs = totalCarbs;

        const newRecipe: Recipe = {
            id: Date.now().toString(),
            name: currentRecipeName,
            ingredients: [...currentRecipeIngredients]
        };
        setRecipes(prev => [...prev, newRecipe]);
        setToast('Guardada como nueva receta');
        setEditingRecipeId(newRecipe.id);

        // Preliminary history entry
        if (computedCarbs > 0) {
            setMealHistory(prev => upsertHistory(prev, { recipeName: currentRecipeName, totalCarbs: computedCarbs }));
        }

        // Do NOT clear or switch tabs
    };

    const loadRecipe = (recipe: Recipe) => {
        setEditingRecipeId(recipe.id);
        setCurrentRecipeName(recipe.name);
        setCurrentRecipeIngredients([...recipe.ingredients]);
        setCookingMode(true);
        // Stay on recipe tab (already there)
    };

    const startNewRecipe = () => {
        setEditingRecipeId(null);
        setCurrentRecipeName('');
        setCurrentRecipeIngredients([]);
        setCookingMode(true);
    };

    const clearCookingState = () => {
        setEditingRecipeId(null);
        setCurrentRecipeName('');
        setCurrentRecipeIngredients([]);
        setCookingMode(false);
    };

    const deleteRecipe = (id: string) => {
        const recipe = recipes.find(r => r.id === id);
        if (!recipe) return;
        if (!window.confirm(`¿Eliminar la receta "${recipe.name}"? Se borrará para toda la familia.`)) return;
        setRecipes(prev => prev.filter(r => r.id !== id));
        if (editingRecipeId === id) setEditingRecipeId(null);
        setToast('Receta eliminada');
    };

    const toggleFamilyMember = (id: string) => {
        setFamily(prev => prev.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m));
    };

    const updateFamilyMember = (id: string, updates: Partial<FamilyMember>) => {
        setFamily(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    const addFamilyMember = () => {
        const newMember: FamilyMember = {
            id: Date.now().toString(),
            name: 'Nuevo Miembro',
            proportion: 0.1,
            isDiabetic: false,
            isActive: true
        };
        setFamily(prev => [...prev, newMember]);
    };

    const removeFamilyMember = (id: string) => {
        const member = family.find(m => m.id === id);
        if (!member || !window.confirm(`¿Eliminar a ${member.name || 'este miembro'} de la familia?`)) return;
        setFamily(prev => prev.filter(m => m.id !== id));
    };

    const addCookware = () => {
        const newCookware: Cookware = {
            id: Date.now().toString(),
            name: 'Nuevo Utensilio',
            mass: 500
        };
        setCookware(prev => [...prev, newCookware]);
    };

    const updateCookware = (id: string, updates: Partial<Cookware>) => {
        setCookware(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const removeCookware = (id: string) => {
        const item = cookware.find(c => c.id === id);
        if (!item || !window.confirm(`¿Eliminar el utensilio "${item.name}"?`)) return;
        setCookware(prev => prev.filter(c => c.id !== id));
        if (selectedCookwareId === id) setSelectedCookwareId('');
    };

    const { handleLogin, handleLogout, leaveGroup, removeGroupMember, invite, createInvite, revokeInvite, pendingInvite } = session;

    // Opened from an invitation link: take the user to the place where it is used
    useEffect(() => {
        if (!pendingInvite || invitePrefilled.current) return;
        invitePrefilled.current = true;
        setInviteInput(pendingInvite);
        setActiveTab('family');
        setToast(user ? 'Invitación recibida: pulsa Unirse' : 'Invitación recibida: inicia sesión y pulsa Unirse');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingInvite]);

    const createGroup = async (name: string) => {
        if (await session.createGroup(name)) setGroupNameInput('');
    };

    const joinGroup = async (inviteCode: string) => {
        if (await session.joinGroup(inviteCode)) setInviteInput('');
    };

    const deleteMealHistoryEntry = (id: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar esta entrada del historial?')) {
            setMealHistory(prev => prev.filter(e => e.id !== id));
            setToast('Entrada eliminada');
        }
    };

    const updateMealHistoryEntry = (id: string, newName: string) => {
        const name = newName.trim();
        if (name) setMealHistory(prev => prev.map(e => e.id === id ? { ...e, recipeName: name } : e));
        setEditingHistoryId(null);
        if (!name) return;
        setToast('Nombre actualizado');
    };

    const saveMealToHistory = (recipeName: string, totalCarbs: number, netWeight: number, portions: Portion[]) => {
        const finalName = recipeName || cachedRecipeName || 'Comida sin nombre';
        setMealHistory(prev => upsertHistory(prev, {
            recipeName: finalName, totalCarbs, netWeight, portions, isBatch: isBatchCooking
        }));
        setToast('Guardado en el historial');
        if (portions.length > 0 && !isBatchCooking) {
            const diabetics = portions.filter(p => p.isDiabetic);
            announceMeal(`${finalName}: reparto listo`, (diabetics.length > 0 ? diabetics : portions)
                .map(p => `${p.memberName}: ${p.carbs.toFixed(1)} g HC (${Math.round(p.weight)} g)`).join(' · '));
        }
    };

    /** Push notification to the rest of the family, if this device is set to send them. */
    const announceMeal = (title: string, body: string) => {
        if (!groupId || !loadPrefs().notifyOnSave) return;
        notifyFamily(groupId, title, body, 'meal').then(devices => {
            if (devices > 0) setToast(`Guardado. Aviso enviado a ${devices} ${devices === 1 ? 'móvil' : 'móviles'} de la familia`);
        });
    };

    /**
     * Silently upserts the current history entry whenever the split changes.
     * Does NOT show a toast — called automatically from SplitTab.
     * The timestamp is always set to now (last split change time).
     */
    const autoUpdateHistory = useCallback((
        recipeName: string,
        totalCarbs: number,
        netWeight: number,
        portions: Portion[]
    ) => {
        if (!recipeName || netWeight <= 0) return;
        setMealHistory(prev => upsertHistory(prev, {
            recipeName, totalCarbs, netWeight, portions, isBatch: isBatchCooking
        }));
    }, [isBatchCooking]);

    const clearReparto = useCallback(() => {
        setSelectedCookwareId('');
        setTotalWeightWithCookware('');
        setSetAsideMode('none');
        setSetAsideValue('');
        setCachedTotalCarbs(0);
        setCachedRecipeName('');
        setIsErrorDisabledForCurrentSplit(false);
    }, []);

    const sharePortion = sharePortionOnWhatsApp;
    const shareDiabeticCarbs = shareDiabeticCarbsOnWhatsApp;

    const copyPortionToClipboard = async (name: string, weight: number, carbs: number, isDiabetic: boolean) => {
        const ok = await copyText(portionMessage(name, weight, carbs, isDiabetic, false));
        setToast(ok ? 'Copiado al portapapeles' : 'No se pudo copiar');
    };

    const shareFullMeal = async (recipeName: string, totalMealCarbs: number, netW: number, portions: Portion[], via: 'whatsapp' | 'clipboard') => {
        if (via === 'whatsapp') {
            shareFullMealOnWhatsApp(recipeName, totalMealCarbs, netW, portions);
            return;
        }
        const ok = await copyText(fullMealMessage(recipeName, totalMealCarbs, netW, portions, false));
        setToast(ok ? 'Reparto copiado al portapapeles' : 'No se pudo copiar');
    };

    /** Exports the whole history: every meal stored in the cloud, not only the ones on this device. */
    const exportMealData = useCallback(async (format: 'json' | 'csv') => {
        let meals = mealHistory;
        if (historyReady && navigator.onLine) {
            try {
                const snapshot = await getDocs(query(collection(db, `${syncDocPath}/meals`), orderBy('timestamp', 'desc')));
                const all = snapshot.docs.map(d => ({ ...(d.data() as MealHistoryEntry), id: d.id }));
                if (all.length >= mealHistory.length) meals = all;
            } catch (err) {
                console.error('Could not download the full history; exporting the local copy', err);
            }
        }
        const date = new Date().toISOString().split('T')[0];
        if (format === 'json') {
            downloadFile(`carbcalc_export_${date}.json`, JSON.stringify(meals, null, 2), 'application/json');
        } else {
            downloadFile(`carbcalc_export_${date}.csv`, mealsToCsv(meals), 'text/csv;charset=utf-8');
        }
        setToast(`${meals.length} comidas exportadas como ${format.toUpperCase()}`);
    }, [mealHistory, historyReady, syncDocPath]);

    return {
        // Tab navigation
        activeTab, setActiveTab,

        // Core data
        ingredients, recipes, family, cookware, mealHistory,
        groupId, familyGroup, groupMembers,

        // UI state
        isLoaded, syncStatus, toast, setToast,
        user, isAuthReady, cloudEnabled: session.cloudEnabled,
        isSidebarOpen, setIsSidebarOpen,
        isInstallable, handleInstallClick,
        showTutorial, dismissTutorial,
        hasConsent, needsConsentPrompt, acceptConsent, declineCloudConsent,

        // Recipe builder
        cookingMode, setCookingMode,
        editingRecipeId, currentRecipeName, setCurrentRecipeName,
        currentRecipeIngredients, searchTerm, setSearchTerm,
        recipeSearchTerm, setRecipeSearchTerm,
        showAddIngredient, setShowAddIngredient,
        newIngredientName, setNewIngredientName,
        newIngredientCarbs, setNewIngredientCarbs,
        newIngredientCategory, setNewIngredientCategory,
        inviteInput, setInviteInput,
        groupNameInput, setGroupNameInput,

        // History
        editingHistoryId, setEditingHistoryId,
        expandedHistoryId, setExpandedHistoryId,
        editingHistoryName, setEditingHistoryName,

        // Split
        selectedCookwareId, setSelectedCookwareId,
        totalWeightWithCookware, setTotalWeightWithCookware,
        cachedTotalCarbs, cachedRecipeName,
        setAsideMode, setSetAsideMode,
        setAsideValue, setSetAsideValue,
        portionErrorPercent, setPortionErrorPercent,
        isErrorDisabledForCurrentSplit, setIsErrorDisabledForCurrentSplit,
        isBatchCooking, setIsBatchCooking,
        clearReparto,
        ingredientWeightHistory,

        // Computed
        filteredIngredients, totalCarbs, activeFamilyProportionSum,
        diabeticMembers, filteredRecipes,
        split, effectiveCarbs, getMemberCarbs,

        // Handlers
        addIngredientToRecipe, createAndAddIngredient,
        customIngredients, createCustomIngredient, updateCustomIngredient, removeCustomIngredient,
        updateIngredientWeight, removeIngredientFromRecipe, setIngredientCooked, scaleCurrentRecipe,
        updateIngredientExtra, ingredientExtras, ingredientById, recipeTotals, saveQuickMeal, getAdaptiveWeight,
        saveRecipe, saveAsNewRecipe, loadRecipe, startNewRecipe, clearCookingState, deleteRecipe,
        toggleFamilyMember, updateFamilyMember, addFamilyMember, removeFamilyMember,
        addCookware, updateCookware, removeCookware,
        handleLogin, handleLogout,
        createGroup, joinGroup, leaveGroup, removeGroupMember,
        invite, createInvite, revokeInvite,
        deleteMealHistoryEntry, updateMealHistoryEntry, saveMealToHistory, autoUpdateHistory,
        sharePortion, copyPortionToClipboard, shareFullMeal, shareDiabeticCarbs,
        exportMealData,
    };
}

export type AppState = ReturnType<typeof useAppState>;
