import { useState, useEffect, useMemo, useCallback } from 'react';
import { Ingredient, Recipe, RecipeIngredient, FamilyMember, Cookware, MealHistoryEntry, FamilyGroup } from '../types';
import { INITIAL_INGREDIENTS } from '../data/ingredients';
import { getMealSlot } from '../utils/dateUtils';
import { sortHistory, upsertHistory } from '../utils/history';
import { computeSplit, memberFraction } from '../utils/split';
import { toPlain } from '../sync/merge';
import { useCloudSync, clearSyncBase, SyncField } from './useCloudSync';
import {
    auth,
    db,
    googleProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    collection,
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    OperationType,
    handleFirestoreError,
    User,
    query,
    where
} from '../firebase';

const STORAGE_KEY = 'carb_calc_state';
const COOKING_STATE_KEY = 'carb_calc_cooking';
const TUTORIAL_KEY = 'carbcalc_tutorial_done';
const CONSENT_KEY = 'carbcalc_consent';

export type TabType = 'recipe' | 'split' | 'family' | 'cookware' | 'history' | 'group' | 'stats' | 'legal';

// Ordered tabs for swipe navigation (main nav bar tabs only)
export const MAIN_TABS: TabType[] = ['recipe', 'split', 'family'];

/** 'cloud' = accepted Firebase sync, 'local' = device-only storage, null = not answered yet. */
type Consent = 'cloud' | 'local' | null;

type Portion = MealHistoryEntry['portions'][number];

/** Everything that is shared with the family through Firestore. */
interface SyncedState extends Record<string, unknown> {
    customIngredients: Ingredient[];
    recipes: Recipe[];
    family: FamilyMember[];
    cookware: Cookware[];
    mealHistory: MealHistoryEntry[];
    ingredientWeightHistory: Record<string, number[]>;
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
    mealHistory: { key: 'id', normalize: v => sortHistory(asArray(v)) },
    ingredientWeightHistory: { normalize: v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) },
    currentRecipeName: { normalize: v => (typeof v === 'string' ? v : '') },
    currentRecipeIngredients: { key: 'ingredientId', normalize: asArray },
    cookingMode: { normalize: v => !!v }
};

export function useAppState() {
    // --- State ---
    const [activeTab, setActiveTab] = useState<TabType>('recipe');
    const [customIngredients, setCustomIngredients] = useState<Ingredient[]>([]);

    const ingredients = useMemo(() => {
        return [...INITIAL_INGREDIENTS, ...customIngredients];
    }, [customIngredients]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [family, setFamily] = useState<FamilyMember[]>([
        { id: '1', name: 'Pablo', proportion: 0.25, isDiabetic: true, isActive: true },
        { id: '2', name: 'Juanjo', proportion: 0.241, isDiabetic: false, isActive: true },
        { id: '3', name: 'Eva', proportion: 0.143, isDiabetic: false, isActive: true }
    ]);
    const [cookware, setCookware] = useState<Cookware[]>([
        { id: '1', name: 'Olla Grande', mass: 1200 },
        { id: '2', name: 'Sartén Mediana', mass: 800 }
    ]);
    const [mealHistory, setMealHistory] = useState<MealHistoryEntry[]>([]);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
    const [groupMembers, setGroupMembers] = useState<any[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    // True once the user's profile document (which says which group they belong to) is known
    const [isProfileReady, setIsProfileReady] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);

    // Privacy consent ('true' is the value stored by older versions)
    const [consent, setConsent] = useState<Consent>(() => {
        const stored = localStorage.getItem(CONSENT_KEY);
        if (stored === 'true' || stored === 'cloud') return 'cloud';
        if (stored === 'local') return 'local';
        return null;
    });
    const hasConsent = consent === 'cloud';
    const needsConsentPrompt = consent === null;

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

    const acceptConsent = useCallback(() => {
        setConsent('cloud');
        localStorage.setItem(CONSENT_KEY, 'cloud');
    }, []);

    /** Keep using the app with device-only storage: nothing is sent to Firebase. */
    const declineCloudConsent = useCallback(() => {
        setConsent('local');
        localStorage.setItem(CONSENT_KEY, 'local');
    }, []);

    // --- Auth & Sync ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsAuthReady(true);
        });
        return () => unsubscribe();
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
                if (parsed.groupId) setGroupId(parsed.groupId);
                if (typeof parsed.portionErrorPercent === 'number') setPortionErrorPercent(parsed.portionErrorPercent);
                if (parsed.ingredientWeightHistory) setIngredientWeightHistory(parsed.ingredientWeightHistory);
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

    // Save shared data to localStorage immediately (the cloud copy is handled by useCloudSync)
    useEffect(() => {
        if (!isLoaded) return;
        const state = { customIngredients, recipes, family, cookware, mealHistory, groupId, portionErrorPercent, ingredientWeightHistory };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('Failed to save state locally', e);
        }
    }, [customIngredients, recipes, family, cookware, mealHistory, groupId, portionErrorPercent, ingredientWeightHistory, isLoaded]);

    // User profile: make sure it exists and follow which group the user belongs to
    const cloudEnabled = isLoaded && isAuthReady && !!user && hasConsent;
    useEffect(() => {
        setIsProfileReady(false);
        if (!cloudEnabled || !user) return;

        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
            const data = snapshot.exists() ? snapshot.data() : null;
            // A cached "does not exist" only means this device has never seen the profile
            if (!data && snapshot.metadata.fromCache) return;

            setGroupId(data?.groupId || null);
            setIsProfileReady(true);

            const profile = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            };
            const isOutdated = !data || (Object.keys(profile) as (keyof typeof profile)[])
                .some(k => (data[k] ?? null) !== (profile[k] ?? null));
            if (isOutdated) {
                setDoc(userDocRef, profile, { merge: true })
                    .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
            }
        }, (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        });

        return () => unsubscribeUser();
    }, [user, cloudEnabled]);

    // Sync with Group members
    useEffect(() => {
        if (!cloudEnabled || !isProfileReady || !groupId) {
            setGroupMembers([]);
            return;
        }

        const q = query(collection(db, 'users'), where('groupId', '==', groupId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const members = snapshot.docs.map(doc => ({
                uid: doc.id,
                displayName: doc.data().displayName,
                photoURL: doc.data().photoURL,
                email: doc.data().email
            }));
            setGroupMembers(members);
        }, (err) => {
            console.error('Failed to fetch group members', err);
        });

        return () => unsubscribe();
    }, [groupId, cloudEnabled, isProfileReady]);

    // Shared data lives in the group document, or in the user's own document when not in a group
    const syncDocPath = !cloudEnabled || !isProfileReady || !user
        ? null
        : groupId ? `groups/${groupId}` : `users/${user.uid}`;

    const syncedState = useMemo<SyncedState>(() => ({
        customIngredients, recipes, family, cookware, mealHistory, ingredientWeightHistory,
        currentRecipeName, currentRecipeIngredients, cookingMode
    }), [customIngredients, recipes, family, cookware, mealHistory, ingredientWeightHistory,
        currentRecipeName, currentRecipeIngredients, cookingMode]);

    const applyRemoteChanges = useCallback((patch: Partial<SyncedState>) => {
        if (patch.customIngredients !== undefined) setCustomIngredients(patch.customIngredients);
        if (patch.recipes !== undefined) setRecipes(patch.recipes);
        if (patch.family !== undefined) setFamily(patch.family);
        if (patch.cookware !== undefined) setCookware(patch.cookware);
        if (patch.mealHistory !== undefined) setMealHistory(patch.mealHistory);
        if (patch.ingredientWeightHistory !== undefined) setIngredientWeightHistory(patch.ingredientWeightHistory);
        if (patch.currentRecipeName !== undefined) setCurrentRecipeName(patch.currentRecipeName);
        if (patch.currentRecipeIngredients !== undefined) setCurrentRecipeIngredients(patch.currentRecipeIngredients);
        if (patch.cookingMode !== undefined) setCookingMode(patch.cookingMode);
    }, []);

    const handleRemoteDocument = useCallback((path: string, data: Record<string, unknown> | null) => {
        if (!path.startsWith('groups/')) return;
        setFamilyGroup(data ? {
            id: String(data.id ?? path.slice('groups/'.length)),
            name: String(data.name ?? ''),
            adminUid: String(data.adminUid ?? ''),
            inviteCode: String(data.inviteCode ?? path.slice('groups/'.length))
        } : null);
    }, []);

    const syncExtra = useMemo(() => (groupId || !user ? undefined : { uid: user.uid }), [groupId, user]);

    const { status: syncStatus } = useCloudSync<SyncedState>({
        docPath: syncDocPath,
        local: syncedState,
        fields: SYNC_FIELDS,
        apply: applyRemoteChanges,
        onRemoteDocument: handleRemoteDocument,
        extraOnWrite: syncExtra,
        createIfMissing: !groupId
    });

    useEffect(() => {
        if (!groupId) setFamilyGroup(null);
    }, [groupId]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsInstallable(true);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        if (result.outcome === 'accepted') {
            setIsInstallable(false);
        }
        setDeferredPrompt(null);
    };

    // --- Computed Values ---
    const filteredIngredients = useMemo(() => {
        return ingredients.filter(i =>
            i.name.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name));
    }, [ingredients, searchTerm]);

    const totalCarbs = useMemo(() => {
        return currentRecipeIngredients.reduce((total, ri) => {
            const ingredient = ingredients.find(i => i.id === ri.ingredientId);
            if (!ingredient) return total;
            return total + (ingredient.carbsPer100g * ri.weight / 100);
        }, 0);
    }, [currentRecipeIngredients, ingredients]);

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

    const createAndAddIngredient = () => {
        const name = newIngredientName.trim();
        const carbs = Number(newIngredientCarbs);
        if (!name || newIngredientCarbs === '') return;
        if (!Number.isFinite(carbs) || carbs < 0 || carbs > 100) {
            setToast('Los HC por 100g deben estar entre 0 y 100');
            return;
        }
        const duplicate = ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
            addIngredientToRecipe(duplicate);
            setNewIngredientName('');
            setNewIngredientCarbs('');
            setNewIngredientCategory('');
            setShowAddIngredient(false);
            setToast(`"${duplicate.name}" ya existía: añadido a la receta`);
            return;
        }
        const category = newIngredientCategory.trim();
        const newIngredient: Ingredient = {
            id: Date.now().toString(),
            name,
            carbsPer100g: carbs,
            ...(category ? { category } : {})
        };
        setCustomIngredients(prev => [...prev, newIngredient]);
        addIngredientToRecipe(newIngredient);
        setNewIngredientName('');
        setNewIngredientCarbs('');
        setNewIngredientCategory('');
        setShowAddIngredient(false);
        setToast('Ingrediente creado y añadido');
    };

    const updateIngredientWeight = (id: string, weight: number) => {
        setCurrentRecipeIngredients(prev =>
            prev.map(ri => ri.ingredientId === id ? { ...ri, weight } : ri)
        );
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

        const computedCarbs = currentRecipeIngredients.reduce((total, ri) => {
            const ingredient = ingredients.find(i => i.id === ri.ingredientId);
            return total + (ingredient ? ingredient.carbsPer100g * ri.weight / 100 : 0);
        }, 0);

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

        const computedCarbs = currentRecipeIngredients.reduce((total, ri) => {
            const ingredient = ingredients.find(i => i.id === ri.ingredientId);
            return total + (ingredient ? ingredient.carbsPer100g * ri.weight / 100 : 0);
        }, 0);

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

    const handleLogin = async () => {
        if (!hasConsent) {
            const ok = window.confirm('Para iniciar sesión y sincronizar con tu familia, tus datos se guardarán en Firebase (Google Cloud). ¿Aceptas?');
            if (!ok) return;
            acceptConsent();
        }
        try {
            await signInWithPopup(auth, googleProvider);
            setToast('Sesión iniciada');
        } catch (error: any) {
            if (error.code === 'auth/popup-closed-by-user') {
                setToast('Inicio de sesión cancelado. Intenta abrir la app en una pestaña nueva.');
            } else if (error.code === 'auth/cancelled-popup-request') {
                console.warn('Login request cancelled (multiple clicks)');
            } else if (error.code === 'auth/popup-blocked') {
                setToast('Ventana emergente bloqueada. Habilita las ventanas emergentes o abre en pestaña nueva.');
            } else {
                console.error('Login failed', error);
                setToast('Error al iniciar sesión');
            }
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            clearSyncBase();
            setToast('Sesión cerrada');
            setFamilyGroup(null);
            setGroupId(null);
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const createGroup = async (name: string) => {
        const groupName = name.trim();
        if (!user || !groupName) return;
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: easier to dictate
        const random = crypto.getRandomValues(new Uint8Array(6));
        const inviteCode = Array.from(random, n => alphabet[n % alphabet.length]).join('');
        const newGroupId = inviteCode;

        const newGroup: FamilyGroup = {
            id: newGroupId,
            name: groupName,
            adminUid: user.uid,
            inviteCode
        };

        try {
            await setDoc(doc(db, 'groups', newGroupId), toPlain({
                ...newGroup,
                customIngredients,
                recipes,
                family,
                cookware,
                mealHistory,
                ingredientWeightHistory,
                updatedAt: new Date().toISOString()
            }));

            await setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: newGroupId }, { merge: true });

            setGroupId(newGroupId);
            setFamilyGroup(newGroup);
            setGroupNameInput('');
            setToast('Grupo creado');
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `groups/${newGroupId}`);
            setToast('No se pudo crear el grupo. Comprueba tu conexión.');
        }
    };

    const joinGroup = async (inviteCodeInput: string) => {
        if (!user) return;
        const inviteCode = inviteCodeInput.trim().toUpperCase();
        if (!inviteCode) return;

        try {
            const groupDoc = await getDoc(doc(db, 'groups', inviteCode));

            if (groupDoc.exists()) {
                await setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: inviteCode }, { merge: true });
                setGroupId(inviteCode);
                setInviteInput('');
                setToast('Te has unido al grupo');
            } else {
                setToast('Código de invitación inválido');
            }
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
            setToast('No se pudo unir al grupo. Comprueba tu conexión.');
        }
    };

    const leaveGroup = async () => {
        if (!user) return;
        if (!window.confirm('¿Salir del grupo? Dejarás de ver los datos compartidos de la familia.')) return;
        try {
            await setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: null }, { merge: true });
            setGroupId(null);
            setFamilyGroup(null);
            setToast('Has salido del grupo');
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
            setToast('No se pudo salir del grupo. Comprueba tu conexión.');
        }
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

    const sharePortion = (name: string, weight: number, carbs: number, isDiabetic: boolean) => {
        const message = `🍽️ *Reparto de Comida*\n\nPara *${name}*:\n- Ración: *${weight.toFixed(0)}g*\n- Carbohidratos: *${carbs.toFixed(1)}g HC*${isDiabetic ? ' (¡Diabético! ⚠️)' : ''}\n\nCalculado con CarbCalc`;
        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };

    const copyPortionToClipboard = (name: string, weight: number, carbs: number, isDiabetic: boolean) => {
        const message = `🍽️ Reparto de Comida\n\nPara ${name}:\n- Ración: ${weight.toFixed(0)}g\n- Carbohidratos: ${carbs.toFixed(1)}g HC${isDiabetic ? ' (¡Diabético! ⚠️)' : ''}\n\nCalculado con CarbCalc`;
        navigator.clipboard.writeText(message).then(() => {
            setToast('Copiado al portapapeles');
        });
    };

    /**
     * Share definitive HC count for a diabetic member via WhatsApp.
     * Uses direct phone URL if member.phone is set, otherwise generic wa.me.
     * The HC count is proportion-based and independent of serving weight.
     */
    const shareDiabeticCarbs = (member: FamilyMember, carbs: number) => {
        const message = `🩺 *HC para ${member.name}*: *${carbs.toFixed(1)}g HC*\n\nCalculado con CarbCalc 💙`;
        const encoded = encodeURIComponent(message);
        // wa.me expects the international number with digits only (no "+", spaces or leading 00)
        const phone = member.phone ? member.phone.replace(/\D/g, '').replace(/^00/, '') : '';
        const url = phone
            ? `https://wa.me/${phone}?text=${encoded}`
            : `https://wa.me/?text=${encoded}`;
        window.open(url, '_blank');
    };

    const shareFullMeal = (recipeName: string, totalMealCarbs: number, netW: number, portions: Portion[], via: 'whatsapp' | 'clipboard') => {
        const portionLines = portions.map(p =>
            `- ${p.memberName}: ${p.weight.toFixed(0)}g (${p.carbs.toFixed(1)}g HC)${p.isDiabetic ? ' ⚠️' : ''}`
        ).join('\n');
        const message = `🍽️ ${via === 'whatsapp' ? '*' : ''}Reparto: ${recipeName}${via === 'whatsapp' ? '*' : ''}\n\nPeso neto: ${netW.toFixed(0)}g\nHC totales: ${totalMealCarbs.toFixed(1)}g\n\n${portionLines}\n\nCalculado con CarbCalc`;
        if (via === 'whatsapp') {
            const encoded = encodeURIComponent(message);
            window.open(`https://wa.me/?text=${encoded}`, '_blank');
        } else {
            navigator.clipboard.writeText(message).then(() => setToast('Reparto copiado al portapapeles'));
        }
    };

    // Export meal data for integration readiness
    const exportMealData = useCallback((format: 'json' | 'csv') => {
        const data = mealHistory.map(entry => ({
            timestamp: entry.timestamp,
            recipeName: entry.recipeName,
            totalCarbs: entry.totalCarbs,
            netWeight: entry.netWeight,
            portions: entry.portions
        }));

        let blob: Blob;
        let filename: string;

        if (format === 'json') {
            blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            filename = `carbcalc_export_${new Date().toISOString().split('T')[0]}.json`;
        } else {
            const headers = ['Fecha', 'Receta', 'HC Totales', 'Peso Neto', 'Persona', 'Peso Ración', 'HC Ración', 'Diabético'];
            const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
            const rows = data.flatMap(entry => {
                const common = [entry.timestamp, entry.recipeName, entry.totalCarbs.toFixed(1), entry.netWeight.toFixed(0)];
                // Batch / not-yet-split meals have no portions but must still be exported
                const portions = entry.portions.length > 0 ? entry.portions : [null];
                return portions.map(p => [
                    ...common,
                    p ? p.memberName : '',
                    p ? p.weight.toFixed(0) : '',
                    p ? p.carbs.toFixed(1) : '',
                    p ? (p.isDiabetic ? 'Sí' : 'No') : ''
                ].map(cell).join(','));
            });
            blob = new Blob(['\uFEFF' + headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
            filename = `carbcalc_export_${new Date().toISOString().split('T')[0]}.csv`;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        setToast(`Datos exportados como ${format.toUpperCase()}`);
    }, [mealHistory]);

    return {
        // Tab navigation
        activeTab, setActiveTab,

        // Core data
        ingredients, recipes, family, cookware, mealHistory,
        groupId, familyGroup, groupMembers,

        // UI state
        isLoaded, syncStatus, toast, setToast,
        user, isAuthReady,
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
        updateIngredientWeight, removeIngredientFromRecipe,
        saveRecipe, saveAsNewRecipe, loadRecipe, startNewRecipe, clearCookingState, deleteRecipe,
        toggleFamilyMember, updateFamilyMember, addFamilyMember, removeFamilyMember,
        addCookware, updateCookware, removeCookware,
        handleLogin, handleLogout,
        createGroup, joinGroup, leaveGroup,
        deleteMealHistoryEntry, updateMealHistoryEntry, saveMealToHistory, autoUpdateHistory,
        sharePortion, copyPortionToClipboard, shareFullMeal, shareDiabeticCarbs,
        exportMealData,
    };
}

export type AppState = ReturnType<typeof useAppState>;
