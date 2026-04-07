export interface Ingredient {
  id: string;
  name: string;
  carbsPer100g: number;
  category?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  weight: number;
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
  portions: {
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

export interface AppState {
  ingredients: Ingredient[];
  recipes: Recipe[];
  family: FamilyMember[];
  cookware: Cookware[];
  portionErrorPercent: number;
}
