import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Users, 
  ChefHat, 
  Scale, 
  Utensils, 
  Save, 
  Search, 
  ChevronRight, 
  CheckCircle2,
  Circle,
  Calculator,
  Info,
  History,
  LogIn,
  LogOut,
  User as UserIcon,
  Cloud,
  CloudOff,
  Share2,
  MessageSquare,
  UserPlus,
  Settings,
  Calendar,
  Menu,
  Book,
  Pencil,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Ingredient, Recipe, RecipeIngredient, FamilyMember, Cookware, MealHistoryEntry, FamilyGroup } from './types';
import { INITIAL_INGREDIENTS } from './data/ingredients';
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
  arrayUnion,
  query,
  where,
  getDocs
} from './firebase';

const STORAGE_KEY = 'carb_calc_state';

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'recipe' | 'split' | 'family' | 'cookware' | 'saved' | 'history' | 'group'>('recipe');
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
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

  // Recipe Builder State
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
  const [inviteInput, setInviteInput] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');

  // Split Calculation State
  const [selectedCookwareId, setSelectedCookwareId] = useState('');
  const [totalWeightWithCookware, setTotalWeightWithCookware] = useState<number | ''>('');

  // --- Auth & Sync ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Load initial data from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.ingredients) setIngredients(parsed.ingredients);
        if (parsed.recipes) setRecipes(parsed.recipes);
        if (parsed.family) setFamily(parsed.family);
        if (parsed.cookware) setCookware(parsed.cookware);
        if (parsed.mealHistory) setMealHistory(parsed.mealHistory);
        if (parsed.groupId) setGroupId(parsed.groupId);
      } catch (e) {
        console.error('Failed to load state', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Sync with Firestore if logged in
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const userDocRef = doc(db, 'users', user.uid);

    // Listen for user profile changes (especially groupId)
    const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.groupId !== groupId) {
          setGroupId(data.groupId || null);
        }
      } else {
        // First time login: sync local data to Firestore
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
  }, [user, isAuthReady, groupId]);

  // Sync with Group members
  useEffect(() => {
    if (!isAuthReady || !user || !groupId) {
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
  }, [groupId, isAuthReady, user]);

  // Sync with Group data if groupId is present
  useEffect(() => {
    if (!isAuthReady || !user || !groupId) return;

    const groupDocRef = doc(db, 'groups', groupId);

    const unsubscribeGroup = onSnapshot(groupDocRef, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites && snapshot.exists()) {
        const data = snapshot.data();
        setIsSyncing(true);
        setFamilyGroup({
          id: data.id,
          name: data.name,
          adminUid: data.adminUid,
          inviteCode: data.inviteCode
        });
        if (data.ingredients) setIngredients(data.ingredients);
        if (data.recipes) setRecipes(data.recipes);
        if (data.family) setFamily(data.family);
        if (data.cookware) setCookware(data.cookware);
        if (data.mealHistory) setMealHistory(data.mealHistory);
        setTimeout(() => setIsSyncing(false), 500);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `groups/${groupId}`);
    });

    return () => unsubscribeGroup();
  }, [user, isAuthReady, groupId]);

  // Sync with User data if NO groupId is present
  useEffect(() => {
    if (!isAuthReady || !user || groupId) return;

    const userDocRef = doc(db, 'users', user.uid);

    const unsubscribeUser = onSnapshot(userDocRef, (snapshot) => {
      if (!snapshot.metadata.hasPendingWrites && snapshot.exists()) {
        const data = snapshot.data();
        setIsSyncing(true);
        if (data.ingredients) setIngredients(data.ingredients);
        if (data.recipes) setRecipes(data.recipes);
        if (data.family) setFamily(data.family);
        if (data.cookware) setCookware(data.cookware);
        if (data.mealHistory) setMealHistory(data.mealHistory);
        setTimeout(() => setIsSyncing(false), 500);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribeUser();
  }, [user, isAuthReady, groupId]);

  // Save changes (Local + Cloud)
  useEffect(() => {
    if (!isLoaded || !isAuthReady || isSyncing) return;
    
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      const state = { ingredients, recipes, family, cookware, mealHistory, groupId };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      if (user) {
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
  }, [ingredients, recipes, family, cookware, mealHistory, groupId, isLoaded, user, isAuthReady, isSyncing]);

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
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };
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

  const activeFamilyProportionSum = useMemo(() => {
    return family.filter(m => m.isActive).reduce((sum, m) => sum + m.proportion, 0);
  }, [family]);

  const diabeticMember = useMemo(() => {
    return family.find(m => m.isDiabetic && m.isActive);
  }, [family]);

  const diabeticCarbs = useMemo(() => {
    if (!diabeticMember || activeFamilyProportionSum === 0) return 0;
    return (diabeticMember.proportion / activeFamilyProportionSum) * totalCarbs;
  }, [diabeticMember, activeFamilyProportionSum, totalCarbs]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => 
      r.name.toLowerCase().includes(recipeSearchTerm.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, recipeSearchTerm]);

  // --- Handlers ---
  const addIngredientToRecipe = (ingredient: Ingredient) => {
    const existing = currentRecipeIngredients.find(ri => ri.ingredientId === ingredient.id);
    if (existing) return;
    setCurrentRecipeIngredients([...currentRecipeIngredients, { ingredientId: ingredient.id, weight: 100 }]);
    setSearchTerm('');
  };

  const createAndAddIngredient = () => {
    if (!newIngredientName || typeof newIngredientCarbs !== 'number') return;
    const newIng: Ingredient = {
      id: Date.now().toString(),
      name: newIngredientName,
      carbsPer100g: newIngredientCarbs
    };
    setIngredients([...ingredients, newIng]);
    addIngredientToRecipe(newIng);
    setNewIngredientName('');
    setNewIngredientCarbs('');
    setShowAddIngredient(false);
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
      setToast('Receta guardada');
    }

    // Reset form
    setEditingRecipeId(null);
    setCurrentRecipeName('');
    setCurrentRecipeIngredients([]);
    setActiveTab('saved');
  };

  const saveAsNewRecipe = () => {
    if (!currentRecipeName || currentRecipeIngredients.length === 0) return;
    
    const newRecipe: Recipe = {
      id: Date.now().toString(),
      name: currentRecipeName,
      ingredients: [...currentRecipeIngredients]
    };
    setRecipes(prev => [...prev, newRecipe]);
    setToast('Guardada como nueva receta');
    setEditingRecipeId(newRecipe.id);
    setActiveTab('saved');
  };

  const loadRecipe = (recipe: Recipe) => {
    setEditingRecipeId(recipe.id);
    setCurrentRecipeName(recipe.name);
    setCurrentRecipeIngredients([...recipe.ingredients]);
    setActiveTab('recipe');
  };

  const startNewRecipe = () => {
    setEditingRecipeId(null);
    setCurrentRecipeName('');
    setCurrentRecipeIngredients([]);
    setActiveTab('recipe');
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
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/popup-closed-by-user') {
        setToast('Inicio de sesión cancelado. Intenta abrir la app en una pestaña nueva.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // This happens if the user clicks login multiple times quickly
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
    const newGroupId = inviteCode; // Use inviteCode as the document ID for easier joining
    
    const newGroup: FamilyGroup = {
      id: newGroupId,
      name,
      adminUid: user.uid,
      inviteCode
    };

    try {
      // Create group document
      await setDoc(doc(db, 'groups', newGroupId), {
        ...newGroup,
        ingredients,
        recipes,
        family,
        cookware,
        mealHistory,
        updatedAt: new Date().toISOString()
      });

      // Update user document
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
      // Since inviteCode IS the groupId, we can just try to get the doc
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
    const newEntry: MealHistoryEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      recipeName,
      totalCarbs,
      netWeight,
      portions
    };
    setMealHistory([newEntry, ...mealHistory].slice(0, 50)); // Keep last 50
    setToast('Comida guardada en el historial');
  };

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

  // --- Render Helpers ---
  const renderRecipeTab = () => (
    <div className="space-y-4">
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-orange-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-1">
            <ChefHat className="text-orange-500" size={18} />
            <input 
              type="text" 
              placeholder="Nombre (opcional para cálculo rápido)" 
              className="flex-1 text-base font-semibold outline-none bg-transparent placeholder:text-gray-300"
              value={currentRecipeName}
              onChange={(e) => setCurrentRecipeName(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(currentRecipeName || currentRecipeIngredients.length > 0) && (
              <button 
                onClick={startNewRecipe}
                className="text-[10px] font-black uppercase px-2 py-1 bg-gray-100 text-gray-500 rounded-lg hover:bg-orange-100 hover:text-orange-600 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Añadir ingrediente..." 
            className="w-full pl-9 pr-4 py-1.5 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
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

        <div className="mb-3">
          {!showAddIngredient ? (
            <button 
              onClick={() => setShowAddIngredient(true)}
              className="text-[10px] font-bold text-orange-500 flex items-center gap-1 hover:underline"
            >
              <Plus size={12} /> Ingrediente nuevo
            </button>
          ) : (
            <div className="bg-orange-50 p-2 rounded-xl space-y-2 border border-orange-100">
              <input 
                type="text" 
                placeholder="Nombre" 
                className="w-full px-2 py-1.5 bg-white rounded-lg text-xs outline-none"
                value={newIngredientName}
                onChange={(e) => setNewIngredientName(e.target.value)}
              />
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="HC/100g" 
                  className="flex-1 px-2 py-1.5 bg-white rounded-lg text-xs outline-none"
                  value={newIngredientCarbs}
                  onChange={(e) => setNewIngredientCarbs(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <button 
                  onClick={createAndAddIngredient}
                  className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                >
                  Añadir
                </button>
                <button 
                  onClick={() => setShowAddIngredient(false)}
                  className="text-gray-400 px-1"
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
                className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl"
              >
                <div className="flex-1">
                  <div className="font-medium text-xs">{ingredient.name}</div>
                  <div className="text-[10px] text-gray-500">{ingredient.carbsPer100g}g HC/100g</div>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={ri.weight}
                    onChange={(e) => updateIngredientWeight(ri.ingredientId, Number(e.target.value))}
                    className="w-16 px-2 py-1 bg-white border border-gray-200 rounded-lg text-right text-sm outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  <span className="text-xs text-gray-500">g</span>
                  <button 
                    onClick={() => removeIngredientFromRecipe(ri.ingredientId)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {currentRecipeIngredients.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-end mb-3">
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Total Carbohidratos</div>
                <div className="text-2xl font-black text-orange-600 leading-none">{totalCarbs.toFixed(1)} <span className="text-sm font-normal">g HC</span></div>
              </div>
              {diabeticMember && (
                <div className="text-right">
                  <div className="text-[10px] text-blue-400 uppercase tracking-wider font-bold">Para {diabeticMember.name}</div>
                  <div className="text-xl font-black text-blue-600 leading-none">{diabeticCarbs.toFixed(1)} <span className="text-xs font-normal">g HC</span></div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button 
                  onClick={saveRecipe}
                  disabled={!currentRecipeName}
                  className={`flex-1 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-sm ${currentRecipeName ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <Save size={16} />
                  {editingRecipeId ? 'Actualizar' : 'Guardar'}
                </button>
                {editingRecipeId && (
                  <button 
                    onClick={saveAsNewRecipe}
                    className="flex-1 py-2.5 bg-white border border-orange-200 text-orange-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-50 transition-colors text-sm"
                  >
                    <Plus size={16} />
                    Como Nueva
                  </button>
                )}
              </div>
              {!currentRecipeName && (
                <div className="flex-1 flex items-center justify-center text-[10px] text-gray-400 font-medium text-center leading-tight">
                  Pon un nombre para guardar como receta
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderFamilyTab = () => (
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

  const renderCookwareTab = () => (
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

  const renderSplitTab = () => {
    const selectedItem = cookware.find(c => c.id === selectedCookwareId);
    const netWeight = (typeof totalWeightWithCookware === 'number' && selectedItem) 
      ? Math.max(0, totalWeightWithCookware - selectedItem.mass) 
      : 0;

    const calculatedPortions = family.filter(m => m.isActive).map(member => {
      const portion = (member.proportion / activeFamilyProportionSum) * netWeight;
      const portionCarbs = totalCarbs > 0 ? (portion * (totalCarbs / netWeight)) : 0;
      return { member, portion, portionCarbs };
    });

    return (
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Scale className="text-green-500" size={24} />
              Reparto de Comida
            </h2>
            {netWeight > 0 && (
              <button 
                onClick={() => saveMealToHistory(
                  currentRecipeName || 'Comida sin nombre',
                  totalCarbs,
                  netWeight,
                  calculatedPortions.map(p => ({
                    memberName: p.member.name,
                    weight: p.portion,
                    carbs: p.portionCarbs,
                    isDiabetic: p.member.isDiabetic
                  }))
                )}
                className="p-2 bg-orange-100 text-orange-600 rounded-xl hover:bg-orange-200 transition-colors"
                title="Guardar en historial"
              >
                <Save size={20} />
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Seleccionar Utensilio</label>
              <div className="grid grid-cols-2 gap-2">
                {cookware.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => setSelectedCookwareId(c.id)}
                    className={`px-3 py-3 rounded-xl text-sm font-medium transition-all ${selectedCookwareId === c.id ? 'bg-purple-500 text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    {c.name}
                    <div className={`text-[10px] ${selectedCookwareId === c.id ? 'text-purple-100' : 'text-gray-400'}`}>{c.mass}g</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Peso Total (con utensilio)</label>
              <div className="flex items-center gap-3">
                <input 
                  type="number" 
                  placeholder="0"
                  value={totalWeightWithCookware}
                  onChange={(e) => setTotalWeightWithCookware(e.target.value === '' ? '' : Number(e.target.value))}
                  className="flex-1 px-4 py-3 bg-gray-50 rounded-2xl text-xl font-bold outline-none focus:ring-2 focus:ring-green-200"
                />
                <span className="text-lg font-bold text-gray-400">g</span>
              </div>
            </div>

            {netWeight > 0 && (
              <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                <div className="text-xs text-green-600 font-bold uppercase mb-1">Peso Neto de la Comida</div>
                <div className="text-2xl font-black text-green-700">{netWeight} g</div>
              </div>
            )}
          </div>
        </div>

        {netWeight > 0 && activeFamilyProportionSum > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-gray-400 uppercase px-2">Raciones Calculadas</h3>
            {calculatedPortions.map(({ member, portion, portionCarbs }) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={member.id} 
                className={`bg-white p-3 rounded-xl shadow-sm border flex justify-between items-center ${member.isDiabetic ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'}`}
              >
                <div className="flex-1">
                  <div className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                    {member.name}
                    {member.isDiabetic && <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase">Diabético</span>}
                  </div>
                  <div className="text-[10px] text-gray-400">Prop: {member.proportion}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-lg font-black text-gray-900 leading-none">{portion.toFixed(0)} <span className="text-xs font-normal">g</span></div>
                    {totalCarbs > 0 && (
                      <div className="text-xs font-bold text-orange-600 mt-0.5">{portionCarbs.toFixed(1)} <span className="text-[10px] font-normal">g HC</span></div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => copyPortionToClipboard(member.name, portion, portionCarbs, member.isDiabetic)}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                      title="Copiar al portapapeles"
                    >
                      <Share2 size={18} />
                    </button>
                    <button 
                      onClick={() => sharePortion(member.name, portion, portionCarbs, member.isDiabetic)}
                      className="p-2 text-green-500 hover:bg-green-50 rounded-full transition-colors"
                      title="Compartir por WhatsApp"
                    >
                      <MessageSquare size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderHistoryTab = () => {
    const groupedHistory = mealHistory.reduce((groups: { [key: string]: MealHistoryEntry[] }, entry) => {
      const date = new Date(entry.timestamp);
      const dateKey = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      const capitalizedKey = dateKey.charAt(0).toUpperCase() + dateKey.slice(1);
      if (!groups[capitalizedKey]) groups[capitalizedKey] = [];
      groups[capitalizedKey].push(entry);
      return groups;
    }, {});

    return (
      <div className="space-y-6 pb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <History className="text-orange-500" size={24} />
          Historial de Comidas
        </h2>
        {mealHistory.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
            <Calendar className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-400 text-sm">No hay comidas registradas.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {(Object.entries(groupedHistory) as [string, MealHistoryEntry[]][]).map(([day, entries]) => (
              <div key={day} className="space-y-3">
                <h3 className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-2">{day}</h3>
                <div className="space-y-2">
                  {entries.map(entry => {
                    const isExpanded = expandedHistoryId === entry.id;
                    return (
                      <div key={entry.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${isExpanded ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100 hover:border-gray-200'}`}>
                        {/* Summary View (Discrete) */}
                        <div 
                          onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)}
                          className="p-4 flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            {editingHistoryId === entry.id ? (
                              <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="text"
                                  value={editingHistoryName}
                                  onChange={(e) => setEditingHistoryName(e.target.value)}
                                  className="flex-1 px-2 py-1 bg-gray-50 border border-blue-200 rounded text-sm font-bold outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') updateMealHistoryEntry(entry.id, editingHistoryName);
                                    if (e.key === 'Escape') setEditingHistoryId(null);
                                  }}
                                />
                                <button 
                                  onClick={() => updateMealHistoryEntry(entry.id, editingHistoryName)}
                                  className="p-1 text-green-500 hover:bg-green-50 rounded"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-gray-800 truncate">{entry.recipeName}</div>
                                <div className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs font-black text-orange-600 leading-none">{entry.totalCarbs.toFixed(0)}g</div>
                            </div>
                            <div className="text-gray-300">
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Detail View */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden border-t border-gray-50"
                            >
                              <div className="p-4 bg-gray-50/50 space-y-4">
                                <div className="flex justify-between items-center">
                                  <div className="text-[10px] font-bold text-gray-400 uppercase">Detalles del Reparto</div>
                                  <div className="flex gap-1">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingHistoryId(entry.id);
                                        setEditingHistoryName(entry.recipeName);
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                      title="Editar nombre"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteMealHistoryEntry(entry.id);
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                      title="Eliminar"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white p-3 rounded-xl border border-gray-100">
                                    <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Peso Neto</div>
                                    <div className="text-lg font-black text-gray-800">{entry.netWeight} <span className="text-xs font-normal">g</span></div>
                                  </div>
                                  <div className="bg-white p-3 rounded-xl border border-gray-100">
                                    <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Carbohidratos</div>
                                    <div className="text-lg font-black text-orange-600">{entry.totalCarbs.toFixed(1)} <span className="text-xs font-normal">g HC</span></div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="text-[10px] font-bold text-gray-400 uppercase px-1">Raciones por Persona</div>
                                  {entry.portions.map((p, idx) => (
                                    <div key={idx} className={`bg-white p-3 rounded-xl border flex justify-between items-center ${p.isDiabetic ? 'border-blue-100 bg-blue-50/20' : 'border-gray-100'}`}>
                                      <div>
                                        <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                          {p.memberName}
                                          {p.isDiabetic && <span className="text-[8px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase">Diabético</span>}
                                        </div>
                                        <div className="text-[10px] text-gray-400">{p.weight.toFixed(0)}g • {p.carbs.toFixed(1)}g HC</div>
                                      </div>
                                      <div className="flex gap-1">
                                        <button 
                                          onClick={() => copyPortionToClipboard(p.memberName, p.weight, p.carbs, p.isDiabetic)}
                                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                                          title="Copiar"
                                        >
                                          <Share2 size={14} />
                                        </button>
                                        <button 
                                          onClick={() => sharePortion(p.memberName, p.weight, p.carbs, p.isDiabetic)}
                                          className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg"
                                          title="WhatsApp"
                                        >
                                          <MessageSquare size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderGroupTab = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="text-blue-500" size={24} />
          Familia Compartida
        </h2>

        {!user ? (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 text-center">
            <CloudOff className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-600 mb-4">Inicia sesión para compartir tus datos con tu familia.</p>
            <button 
              onClick={handleLogin}
              className="w-full py-3 bg-blue-500 text-white rounded-2xl font-bold hover:bg-blue-600 transition-colors"
            >
              Iniciar Sesión
            </button>
          </div>
        ) : groupId && familyGroup ? (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-blue-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-xs font-bold text-blue-400 uppercase">Grupo Activo</div>
                  <h3 className="text-2xl font-black text-gray-800">{familyGroup.name}</h3>
                </div>
                <button 
                  onClick={leaveGroup}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  title="Salir del grupo"
                >
                  <LogOut size={20} />
                </button>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-4">
                <div className="text-[10px] text-blue-600 font-bold uppercase mb-1">Código de Invitación</div>
                <div className="flex items-center justify-between">
                  <div className="text-xl font-mono font-black text-blue-800 tracking-widest">{familyGroup.inviteCode}</div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(familyGroup.inviteCode);
                      setToast('Código copiado');
                    }}
                    className="text-xs font-bold text-blue-600 underline"
                  >
                    Copiar
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed mb-6">
                Todos los miembros con este código compartirán ingredientes, recetas, familia y utensilios en tiempo real.
              </p>

              <div className="space-y-3">
                <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Miembros del Grupo</div>
                <div className="space-y-2">
                  {groupMembers.map(member => (
                    <div key={member.uid} className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl">
                      {member.photoURL ? (
                        <img src={member.photoURL} alt="" className="w-8 h-8 rounded-full border border-white shadow-sm" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
                          <UserIcon size={14} />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-bold text-gray-800">{member.displayName || 'Usuario'}</div>
                        <div className="text-[10px] text-gray-400">{member.email}</div>
                      </div>
                      {member.uid === familyGroup.adminUid && (
                        <span className="text-[8px] font-black uppercase bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Admin</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Plus className="text-green-500" size={20} />
                Crear Nuevo Grupo
              </h3>
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Nombre de la familia (ej: Los García)" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-green-200"
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                />
                <button 
                  onClick={() => createGroup(groupNameInput)}
                  disabled={!groupNameInput}
                  className={`w-full py-3 rounded-2xl font-bold transition-colors ${groupNameInput ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  Crear Grupo
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus className="text-blue-500" size={20} />
                Unirse a un Grupo
              </h3>
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Código de invitación" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-200 uppercase font-mono"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                />
                <button 
                  onClick={() => joinGroup(inviteInput)}
                  disabled={!inviteInput}
                  className={`w-full py-3 rounded-2xl font-bold transition-colors ${inviteInput ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  Unirse
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSavedTab = () => (
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-24">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                    <Calculator size={18} />
                  </div>
                  <span className="font-black text-xl">CarbCalc</span>
                </div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Opciones Avanzadas</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <SidebarButton 
                  active={activeTab === 'history'} 
                  onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }} 
                  icon={<History size={20} />} 
                  label="Historial de Comidas"
                  description="Ver repartos anteriores"
                />
                <SidebarButton 
                  active={activeTab === 'group'} 
                  onClick={() => { setActiveTab('group'); setIsSidebarOpen(false); }} 
                  icon={<Cloud size={20} />} 
                  label="Sincronización en la Nube"
                  description="Compartir con la familia"
                />
                <SidebarButton 
                  active={activeTab === 'cookware'} 
                  onClick={() => { setActiveTab('cookware'); setIsSidebarOpen(false); }} 
                  icon={<Utensils size={20} />} 
                  label="Mis Utensilios"
                  description="Ollas, sartenes y pesos"
                />

                {isInstallable && (
                  <div className="pt-4 border-t border-gray-100 mt-4">
                    <button 
                      onClick={handleInstallClick}
                      className="w-full flex items-center gap-3 p-3 bg-orange-50 text-orange-600 rounded-2xl hover:bg-orange-100 transition-all border border-orange-100 group"
                    >
                      <div className="w-10 h-10 bg-orange-500 text-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <Download size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold">Instalar App</div>
                        <div className="text-[10px] opacity-70">Acceso rápido desde el móvil</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50">
                {user ? (
                  <div className="flex items-center gap-3">
                    <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800 truncate">{user.displayName}</div>
                      <div className="text-[10px] text-gray-400 truncate">{user.email}</div>
                    </div>
                    <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">
                      <LogOut size={18} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  >
                    <LogIn size={18} />
                    Iniciar Sesión
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white px-6 py-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-200">
                <Calculator size={20} />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight leading-none">CarbCalc</h1>
                <div className="flex items-center gap-1.5">
                  {saveStatus !== 'idle' && (
                    <span className={`text-[8px] font-bold uppercase px-1 rounded ${saveStatus === 'saving' ? 'text-blue-400' : 'text-green-400'}`}>
                      {saveStatus === 'saving' ? '...' : 'OK'}
                    </span>
                  )}
                  {user ? (
                    <span className="text-[8px] font-bold uppercase text-blue-400">Nube</span>
                  ) : (
                    <span className="text-[8px] font-bold uppercase text-gray-400">Local</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && user.photoURL && (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-gray-100" referrerPolicy="no-referrer" />
            )}
            <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
              <Info size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'recipe' && renderRecipeTab()}
            {activeTab === 'split' && renderSplitTab()}
            {activeTab === 'family' && renderFamilyTab()}
            {activeTab === 'cookware' && renderCookwareTab()}
            {activeTab === 'saved' && renderSavedTab()}
            {activeTab === 'history' && renderHistoryTab()}
            {activeTab === 'group' && renderGroupTab()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-2 py-3 flex justify-around items-center z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <NavButton 
          active={activeTab === 'recipe'} 
          onClick={() => setActiveTab('recipe')} 
          icon={<ChefHat size={20} />} 
          label="Cocinar"
        />
        <NavButton 
          active={activeTab === 'saved'} 
          onClick={() => setActiveTab('saved')} 
          icon={<Book size={20} />} 
          label="Recetas"
        />
        <NavButton 
          active={activeTab === 'split'} 
          onClick={() => setActiveTab('split')} 
          icon={<Scale size={20} />} 
          label="Reparto"
        />
        <NavButton 
          active={activeTab === 'family'} 
          onClick={() => setActiveTab('family')} 
          icon={<Users size={20} />} 
          label="Familia"
        />
      </nav>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl text-sm font-bold flex items-center gap-2"
          >
            <CheckCircle2 className="text-green-400" size={18} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarButton({ active, onClick, icon, label, description }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, description: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-3 rounded-2xl transition-all ${active ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}
    >
      <div className={`${active ? 'text-orange-500' : 'text-gray-400'}`}>
        {icon}
      </div>
      <div className="text-left">
        <div className="text-sm font-bold leading-none mb-1">{label}</div>
        <div className="text-[10px] text-gray-400 font-medium">{description}</div>
      </div>
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-orange-500 scale-110' : 'text-gray-400'}`}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      {active && <motion.div layoutId="nav-indicator" className="w-1 h-1 bg-orange-500 rounded-full mt-0.5" />}
    </button>
  );
}
