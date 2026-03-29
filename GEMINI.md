# GEMINI.md — CarbCalc LLM Context

This file provides structured context for LLMs working on this codebase.

## Project Overview

CarbCalc is a **carbohydrate calculator PWA** for families with diabetic members. Built with React 19 + Vite 6 + Tailwind CSS 4 + Firebase 12 + Framer Motion.

**Language**: UI is in **Spanish (Spain)**. Code comments and commit messages are in **English**.

## Architecture

### State Management

All application state lives in a single custom hook: `src/hooks/useAppState.ts`. This hook:
- Manages ~30 pieces of state (ingredients, recipes, family, cookware, history, auth, UI)
- Handles all CRUD operations via handler functions
- Computes derived values (`totalCarbs`, `diabeticMembers`, `filteredIngredients`, etc.)
- Manages localStorage persistence and Firestore sync
- Returns everything as a flat object (`AppState`)

**There is no Redux, Context API, or other state management library.** Components receive the `AppState` object as a prop called `state`.

### Component Pattern

All tab components follow the same pattern:

```tsx
import { AppState } from '../hooks/useAppState';

interface MyTabProps {
  state: AppState;
}

export function MyTab({ state }: MyTabProps) {
  const { prop1, prop2, handler1 } = state;
  // ... render
}
```

### Data Flow

```
useAppState (hook)
  ├── localStorage (immediate persistence)
  ├── Firebase Firestore (cloud sync, with offline IndexedDB persistence)
  └── Returns AppState object
        ├── App.tsx (routing shell)
        │   ├── RecipeTab
        │   ├── SplitTab
        │   ├── FamilyTab
        │   ├── HistoryTab
        │   ├── StatsTab
        │   ├── GroupTab
        │   ├── Sidebar
        │   └── ...
```

### Key Types (src/types.ts)

- `Ingredient` — { id, name, carbsPer100g }
- `Recipe` — { id, name, ingredients: RecipeIngredient[] }
- `RecipeIngredient` — { ingredientId, weight }
- `FamilyMember` — { id, name, proportion, isDiabetic, isActive }
- `Cookware` — { id, name, mass }
- `MealHistoryEntry` — { id, timestamp, recipeName, totalCarbs, netWeight, portions[] }
- `FamilyGroup` — { id, name, adminUid, inviteCode }
- `AppState` — ReturnType<typeof useAppState> (exported from useAppState)

### Firebase Structure

- `users/{uid}` — User profile + personal data (when not in a group)
- `groups/{groupId}` — Shared group data (ingredients, recipes, family, cookware, history)
- Auth: Google Sign-In only
- Offline persistence enabled via `enableIndexedDbPersistence`

## Common Tasks

### Adding a new tab

1. Create `src/components/MyNewTab.tsx` following the component pattern above
2. Add the tab name to `TabType` union in `useAppState.ts`
3. Add `{activeTab === 'mynewtab' && <MyNewTab state={state} />}` in `App.tsx`
4. Add a `SidebarButton` in `Sidebar.tsx` (or `NavButton` in `App.tsx` if it's a main tab)

### Adding new state

1. Add the `useState` in `useAppState.ts`
2. Return it from the hook
3. If it should persist, add it to the `state` object in the save effect and the load logic

### Adding a new ingredient field

1. Update `Ingredient` type in `types.ts`
2. Update `INITIAL_INGREDIENTS` in `data/ingredients.ts`
3. Update the recipe tab UI to display/edit the new field

## Important Notes

- The split calculation in `SplitTab.tsx` handles complex interplay between cookware mass, set-aside food, and error margins
- `cachedTotalCarbs` ensures the split tab shows carbs even after the recipe form is cleared
- The stats panel classifies meals by timestamp hour (6-11=breakfast, 11-16=lunch, 16-23=dinner)
- The legal notice follows RGPD/LOPDGDD two-layer information system
- Pre-existing lint errors in `firebase.ts` are due to `import.meta.env` typing (resolved at runtime by Vite)
