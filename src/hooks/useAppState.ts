import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Ingredient, Recipe, RecipeIngredient, FamilyMember, Cookware, MealHistoryEntry, FamilyGroup } from '../types';
import { INITIAL_INGREDIENTS } from '../data/ingredients';
import { getMealSlot } from '../utils/dateUtils';
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
    updateDoc,
    query,
    where,
    getDocs
} from '../firebase';

const STORAGE_KEY = 'carb_calc_state';
const COOKING_STATE_KEY = 'carb_calc_cooking';
const TUTORIAL_KEY = 'carbcalc_tutorial_done';
const DARK_MODE_KEY = 'carbcalc_dark_mode';
const CONSENT_KEY = 'carbcalc_consent';

export type TabType = 'recipe' | 'split' | 'family' | 'cookware' | 'history' | 'group' | 'stats' | 'legal';

// Ordered tabs for swipe navigation (main nav bar tabs only)
export const MAIN_TABS: TabType[] = ['recipe', 'split', 'family'];

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
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [toast, setToast] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);

    // Dark mode — system preference only

    // Cookie consent
    const [hasConsent, setHasConsent] = useState(() => {
        return localStorage.getItem(CONSENT_KEY) === 'true';
    });

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

    // Auto-save state for reparto
    const [pendingAutoSave, setPendingAutoSave] = useState(false);
    const [autoSaveCountdown, setAutoSaveCountdown] = useState(0);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Ref to guard save effect against writing back data that just arrived from Firestore
    const isSyncingFromRemote = useRef(false);

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
        setHasConsent(true);
        localStorage.setItem(CONSENT_KEY, 'true');
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

    // Helper to extract custom ingredients from legacy or new saved arrays
    const extractCustomIngredients = useCallback((savedIngredients: Ingredient[], savedCustomIngredients?: Ingredient[]) => {
        if (savedCustomIngredients) {
            return savedCustomIngredients;
        }
        // Legacy migration: filter out old standard ingredients but KEEP custom ones if we wanted to
        // HOWEVER, user requested a FULL wipe of custom ingredients.
        // Therefore, we just return empty array for everyone right now, ignoring the old ingredients completely.
        return [];
    }, []);


    // Load initial data from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        let loadedMealHistory: MealHistoryEntry[] = [];
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.customIngredients) setCustomIngredients(parsed.customIngredients);
                else setCustomIngredients([]); // Force reset of legacy ingredients
                if (parsed.recipes) setRecipes(parsed.recipes);
                if (parsed.family) setFamily(parsed.family);
                if (parsed.cookware) setCookware(parsed.cookware);
                if (parsed.mealHistory) {
                    setMealHistory(parsed.mealHistory);
                    loadedMealHistory = parsed.mealHistory;
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
                    // Find the most recent history entry for this recipe name
                    const lastEntry = [...loadedMealHistory]
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .find(m => m.recipeName === cachedName);
                    if (!lastEntry) return false;
                    const entrySlot = getMealSlot(new Date(lastEntry.timestamp).getHours());
                    return entrySlot !== currentSlot;
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
        };
        localStorage.setItem(COOKING_STATE_KEY, JSON.stringify(cookingState));
    }, [currentRecipeName, currentRecipeIngredients, editingRecipeId, cookingMode,
        selectedCookwareId, totalWeightWithCookware, cachedTotalCarbs, cachedRecipeName,
        setAsideMode, setAsideValue, isLoaded]);

    // Sync with Firestore if logged in
    useEffect(() => {
        if (!isAuthReady || !user || !hasConsent) return;

        const userDocRef = doc(db, 'users', user.uid);

        const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.groupId !== groupId) {
                    setGroupId(data.groupId || null);
                }
            } else {
                const localData = localStorage.getItem(STORAGE_KEY);
                if (localData) {
                    try {
                        const parsed = JSON.parse(localData);
                        setDoc(userDocRef, {
                            uid: user.uid,
                            email: user.email,
                            displayName: user.displayName,
                            groupId: parsed.groupId || null,
                            updatedAt: new Date().toISOString()
                        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
                    } catch (e) {
                        console.error('Failed to sync local data to Firestore', e);
                    }
                }
            }
        });

        return () => unsubscribeUser();
    }, [user, isAuthReady, groupId, hasConsent]);

    // Sync with Group members
    useEffect(() => {
        if (!isAuthReady || !user || !groupId || !hasConsent) {
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
    }, [groupId, isAuthReady, user, hasConsent]);

    // Sync with Group data if groupId is present
    useEffect(() => {
        if (!isAuthReady || !user || !groupId || !hasConsent) return;

        const groupDocRef = doc(db, 'groups', groupId);

        const unsubscribeGroup = onSnapshot(groupDocRef, (snapshot) => {
            if (!snapshot.metadata.hasPendingWrites && snapshot.exists()) {
                const data = snapshot.data();
                isSyncingFromRemote.current = true;
                setIsSyncing(true);
                setFamilyGroup({
                    id: data.id,
                    name: data.name,
                    adminUid: data.adminUid,
                    inviteCode: data.inviteCode
                });
                if (data.customIngredients) setCustomIngredients(data.customIngredients);
                else setCustomIngredients([]);
                if (data.recipes) setRecipes(data.recipes);
                if (data.family) setFamily(data.family);
                if (data.cookware) setCookware(data.cookware);
                if (data.mealHistory) setMealHistory(data.mealHistory);
                setTimeout(() => {
                    setIsSyncing(false);
                    isSyncingFromRemote.current = false;
                }, 1500);
            }
        }, (err) => {
            handleFirestoreError(err, OperationType.GET, `groups/${groupId}`);
        });

        return () => unsubscribeGroup();
    }, [user, isAuthReady, groupId, hasConsent]);

    // Sync with User data if NO groupId is present
    useEffect(() => {
        if (!isAuthReady || !user || groupId || !hasConsent) return;

        const userDocRef = doc(db, 'users', user.uid);

        const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
            if (!snapshot.metadata.hasPendingWrites && snapshot.exists()) {
                const data = snapshot.data();
                isSyncingFromRemote.current = true;
                setIsSyncing(true);
                if (data.customIngredients) setCustomIngredients(data.customIngredients);
                else setCustomIngredients([]);
                if (data.recipes) setRecipes(data.recipes);
                if (data.family) setFamily(data.family);
                if (data.cookware) setCookware(data.cookware);
                if (data.mealHistory) setMealHistory(data.mealHistory);
                setTimeout(() => {
                    setIsSyncing(false);
                    isSyncingFromRemote.current = false;
                }, 1500);
            }
        }, (err) => {
            handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        });

        return () => unsubscribeUser();
    }, [user, isAuthReady, groupId, hasConsent]);

    // Save changes (Local + Cloud)
    useEffect(() => {
        if (!isLoaded || !isAuthReady || isSyncing || isSyncingFromRemote.current) return;

        setSaveStatus('saving');
        const timer = setTimeout(async () => {
            const state = { customIngredients, recipes, family, cookware, mealHistory, groupId, portionErrorPercent, ingredientWeightHistory };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

            if (user && hasConsent) {
                try {
                    if (groupId) {
                        const groupDocRef = doc(db, 'groups', groupId);
                        await setDoc(groupDocRef, {
                            ...state,
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                    } else {
                        const userDocRef = doc(db, 'users', user.uid);
                        await setDoc(userDocRef, {
                            ...state,
                            uid: user.uid,
                            email: user.email,
                            displayName: user.displayName,
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                    }
                } catch (err) {
                    console.error('Firestore save failed', err);
                }
            }

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }, 1000);

        return () => clearTimeout(timer);
    }, [customIngredients, recipes, family, cookware, mealHistory, groupId, portionErrorPercent, ingredientWeightHistory, isLoaded, user, isAuthReady, isSyncing, hasConsent]);

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

    const diabeticCarbsMap = useMemo(() => {
        const map = new Map<string, number>();
        if (activeFamilyProportionSum === 0) return map;
        diabeticMembers.forEach(m => {
            map.set(m.id, (m.proportion / activeFamilyProportionSum) * totalCarbs);
        });
        return map;
    }, [diabeticMembers, activeFamilyProportionSum, totalCarbs]);

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
        const existing = currentRecipeIngredients.find(ri => ri.ingredientId === ingredient.id);
        if (existing) return;
        const defaultWeight = initialWeight !== undefined ? initialWeight : getAdaptiveWeight(ingredient.id);
        setCurrentRecipeIngredients([...currentRecipeIngredients, { ingredientId: ingredient.id, weight: defaultWeight }]);
        setSearchTerm('');
    };

    const createAndAddIngredient = () => {
        if (!newIngredientName || newIngredientCarbs === '') return;
        const newIngredient: Ingredient = {
            id: Date.now().toString(),
            name: newIngredientName,
            carbsPer100g: Number(newIngredientCarbs),
            category: newIngredientCategory || undefined
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

        // Create/update a preliminary history entry (no split data yet)
        if (computedCarbs > 0) {
            setMealHistory(prevMeals => {
                const now = Date.now();
                const TWO_HOURS = 2 * 60 * 60 * 1000;
                const existingIdx = prevMeals.findIndex(
                    m => m.recipeName === currentRecipeName && (now - new Date(m.timestamp).getTime()) < TWO_HOURS
                );
                const entry = {
                    id: existingIdx >= 0 ? prevMeals[existingIdx].id : now.toString(),
                    timestamp: new Date().toISOString(),
                    recipeName: currentRecipeName,
                    totalCarbs: computedCarbs,
                    netWeight: existingIdx >= 0 ? prevMeals[existingIdx].netWeight : 0,
                    portions: existingIdx >= 0 ? prevMeals[existingIdx].portions : [],
                };
                if (existingIdx >= 0) {
                    const updated = [...prevMeals];
                    updated[existingIdx] = entry;
                    return updated;
                }
                return [entry, ...prevMeals].slice(0, 50);
            });
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
            setMealHistory(prevMeals => {
                const now = Date.now();
                const TWO_HOURS = 2 * 60 * 60 * 1000;
                const existingIdx = prevMeals.findIndex(
                    m => m.recipeName === currentRecipeName && (now - new Date(m.timestamp).getTime()) < TWO_HOURS
                );
                const entry = {
                    id: existingIdx >= 0 ? prevMeals[existingIdx].id : now.toString(),
                    timestamp: new Date().toISOString(),
                    recipeName: currentRecipeName,
                    totalCarbs: computedCarbs,
                    netWeight: existingIdx >= 0 ? prevMeals[existingIdx].netWeight : 0,
                    portions: existingIdx >= 0 ? prevMeals[existingIdx].portions : [],
                };
                if (existingIdx >= 0) {
                    const updated = [...prevMeals];
                    updated[existingIdx] = entry;
                    return updated;
                }
                return [entry, ...prevMeals].slice(0, 50);
            });
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
        setRecipes(prev => prev.filter(r => r.id !== id));
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
        setFamily([...family, newMember]);
    };

    const removeFamilyMember = (id: string) => {
        setFamily(prev => prev.filter(m => m.id !== id));
    };

    const addCookware = () => {
        const newCookware: Cookware = {
            id: Date.now().toString(),
            name: 'Nuevo Utensilio',
            mass: 500
        };
        setCookware([...cookware, newCookware]);
    };

    const updateCookware = (id: string, updates: Partial<Cookware>) => {
        setCookware(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    const removeCookware = (id: string) => {
        setCookware(prev => prev.filter(c => c.id !== id));
    };

    const handleLogin = async () => {
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
            setToast('Sesión cerrada');
            setFamilyGroup(null);
            setGroupId(null);
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const createGroup = async (name: string) => {
        if (!user) return;
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newGroupId = inviteCode;

        const newGroup: FamilyGroup = {
            id: newGroupId,
            name,
            adminUid: user.uid,
            inviteCode
        };

        try {
            await setDoc(doc(db, 'groups', newGroupId), {
                ...newGroup,
                customIngredients,
                recipes,
                family,
                cookware,
                mealHistory,
                updatedAt: new Date().toISOString()
            });

            await updateDoc(doc(db, 'users', user.uid), {
                groupId: newGroupId
            });

            setGroupId(newGroupId);
            setFamilyGroup(newGroup);
            setToast('Grupo creado');
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `groups/${newGroupId}`);
        }
    };

    const joinGroup = async (inviteCodeInput: string) => {
        if (!user) return;
        const inviteCode = inviteCodeInput.trim().toUpperCase();
        if (!inviteCode) return;

        try {
            const groupDoc = await getDoc(doc(db, 'groups', inviteCode));

            if (groupDoc.exists()) {
                await updateDoc(doc(db, 'users', user.uid), {
                    groupId: inviteCode
                });
                setGroupId(inviteCode);
                setToast('Te has unido al grupo');
            } else {
                setToast('Código de invitación inválido');
            }
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
    };

    const leaveGroup = async () => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                groupId: null
            });
            setGroupId(null);
            setFamilyGroup(null);
            setToast('Has salido del grupo');
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
    };

    const deleteMealHistoryEntry = (id: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar esta entrada del historial?')) {
            setMealHistory(prev => prev.filter(e => e.id !== id));
            setToast('Entrada eliminada');
        }
    };

    const updateMealHistoryEntry = (id: string, newName: string) => {
        setMealHistory(prev => prev.map(e => e.id === id ? { ...e, recipeName: newName } : e));
        setEditingHistoryId(null);
        setToast('Nombre actualizado');
    };

    const saveMealToHistory = (recipeName: string, totalCarbs: number, netWeight: number, portions: any[]) => {
        const finalName = recipeName || cachedRecipeName || 'Comida sin nombre';

        setMealHistory(prevMeals => {
            const now = Date.now();
            const TWO_HOURS = 2 * 60 * 60 * 1000; // 2 hours window for overwrite

            // Look for a recent entry with the same recipe name
            const recentDuplicateIndex = prevMeals.findIndex(
                m => m.recipeName === finalName && (now - new Date(m.timestamp).getTime()) < TWO_HOURS
            );

            const newEntry: MealHistoryEntry = {
                id: recentDuplicateIndex >= 0 ? prevMeals[recentDuplicateIndex].id : now.toString(),
                timestamp: new Date().toISOString(),
                recipeName: finalName,
                totalCarbs,
                netWeight,
                portions
            };

            if (recentDuplicateIndex >= 0) {
                // Overwrite the existing entry
                const updated = [...prevMeals];
                updated[recentDuplicateIndex] = newEntry;
                return updated;
            } else {
                // Add new entry
                return [newEntry, ...prevMeals].slice(0, 50);
            }
        });

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
        portions: { memberName: string; weight: number; carbs: number; isDiabetic: boolean }[]
    ) => {
        if (!recipeName || netWeight <= 0) return;
        const finalName = recipeName;
        setMealHistory(prevMeals => {
            const now = Date.now();
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            const existingIdx = prevMeals.findIndex(
                m => m.recipeName === finalName && (now - new Date(m.timestamp).getTime()) < TWO_HOURS
            );
            const entry = {
                id: existingIdx >= 0 ? prevMeals[existingIdx].id : now.toString(),
                timestamp: new Date().toISOString(),
                recipeName: finalName,
                totalCarbs,
                netWeight,
                portions,
            };
            if (existingIdx >= 0) {
                const updated = [...prevMeals];
                updated[existingIdx] = entry;
                return updated;
            }
            return [entry, ...prevMeals].slice(0, 50);
        });
    }, []);

    const cancelAutoSave = useCallback(() => {
        // Kept for signature compatibility if still called elsewhere, though no longer needed
        setPendingAutoSave(false);
    }, []);

    const clearReparto = useCallback(() => {
        cancelAutoSave();
        setSelectedCookwareId('');
        setTotalWeightWithCookware('');
        setSetAsideMode('none');
        setSetAsideValue('');
        setCachedTotalCarbs(0);
        setCachedRecipeName('');
        setIsErrorDisabledForCurrentSplit(false);
    }, [cancelAutoSave]);

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
        const phone = member.phone ? member.phone.replace(/[^0-9+]/g, '') : '';
        const url = phone
            ? `https://wa.me/${phone}?text=${encoded}`
            : `https://wa.me/?text=${encoded}`;
        window.open(url, '_blank');
    };

    const shareFullMeal = (recipeName: string, totalMealCarbs: number, netW: number, portions: { memberName: string; weight: number; carbs: number; isDiabetic: boolean }[], via: 'whatsapp' | 'clipboard') => {
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
            const rows = data.flatMap(entry =>
                entry.portions.map(p => [
                    entry.timestamp,
                    entry.recipeName,
                    entry.totalCarbs.toFixed(1),
                    entry.netWeight.toFixed(0),
                    p.memberName,
                    p.weight.toFixed(0),
                    p.carbs.toFixed(1),
                    p.isDiabetic ? 'Sí' : 'No'
                ].join(','))
            );
            blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
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
        isLoaded, saveStatus, toast, setToast,
        user, isAuthReady, isSyncing,
        isSidebarOpen, setIsSidebarOpen,
        isInstallable, handleInstallClick,
        showTutorial, dismissTutorial,
        hasConsent, acceptConsent,

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
        pendingAutoSave, autoSaveCountdown,
        cancelAutoSave, clearReparto,
        ingredientWeightHistory,

        // Computed
        filteredIngredients, totalCarbs, activeFamilyProportionSum,
        diabeticMembers, diabeticCarbsMap, filteredRecipes,

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
