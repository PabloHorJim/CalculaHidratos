export interface Ingredient {
  id: string;
  name: string;
  carbsPer100g: number;
  category?: string;
  /** Grams of one piece ("1 plátano ≈ 120 g") and what a piece is called. */
  unitWeight?: number;
  unitName?: string;
  /** Cooked weight / raw weight (pasta ≈ 2.3). */
  cookedFactor?: number;
  fatPer100g?: number;
  proteinPer100g?: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  weight: number;
  /** Weighed after cooking: converted to raw weight with the ingredient's cookedFactor. */
  cooked?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
}

export interface FamilyMember {
  id: string;
  name: string;
  proportion: number;
  isDiabetic: boolean;
  isActive: boolean;
  phone?: string; // WhatsApp number for diabetic members (e.g. "+34600000000")
}

export interface Cookware {
  id: string;
  name: string;
  mass: number;
}

export interface MealHistoryEntry {
  id: string;
  timestamp: string;
  recipeName: string;
  totalCarbs: number;
  netWeight: number;
  isBatch?: boolean;
  /** "single": something one person ate on their own (snack, fruit...), not a shared dish. */
  kind?: 'single';
  /** Fat and protein of the whole dish, when every ingredient has that data. */
  totalFat?: number;
  totalProtein?: number;
  portions: {
    memberId?: string; // absent in entries saved by older versions
    memberName: string;
    weight: number;
    carbs: number;
    isDiabetic: boolean;
  }[];
}

export interface FamilyGroup {
  id: string;
  name: string;
  adminUid: string;
  inviteCode: string;
}

export interface GroupMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

export interface AppState {
  ingredients: Ingredient[];
  recipes: Recipe[];
  family: FamilyMember[];
  cookware: Cookware[];
  portionErrorPercent: number;
}
