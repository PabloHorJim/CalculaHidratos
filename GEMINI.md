# GEMINI.md — CarbCalc LLM Context

This file provides structured context for LLMs working on this codebase.

## Project Overview

CarbCalc is a **carbohydrate calculator PWA** for families with diabetic members. Built with React 19 + Vite 6 + Tailwind CSS 4 + Firebase 12 + Framer Motion.

**Language**: UI is in **Spanish (Spain)**. Code comments and commit messages are in **English**.

## Architecture

### State Management

All application state lives in a single custom hook: `src/hooks/useAppState.ts`. This hook:
- Manages ~30 pieces of state (ingredients, recipes, family, cookware, history, auth, UI)
- Handles all CRUD operations via handler functions (auth/group logic lives in `useSession`)
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
- Offline cache via `persistentLocalCache` (multi-tab)

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

## Cloud sync (read before touching persistence)

- `src/sync/merge.ts` — pure three-way merge (`base` / `local` / `remote`), record by record for arrays keyed by `id`.
- `src/sync/engine.ts` — framework-free `SyncEngine`. It never writes before the server copy has been received,
  pushes only the fields that changed inside a Firestore transaction, and while offline keeps changes local
  (together with the last known server copy in `localStorage['carb_calc_sync_base']`) until the connection returns.
- `src/hooks/useCloudSync.ts` — React/Firestore wrapper. The synced fields are listed in `SYNC_FIELDS` in `useAppState.ts`.
- To sync a new piece of state: add it to `SyncedState`, `SYNC_FIELDS`, `syncedState` and `applyRemoteChanges`.
- Never call `setDoc` on a data document with the whole state: that is the bug this design replaced.
- Never let `undefined` reach Firestore (use `toPlain` or omit the key).

## Data model (Firestore)

- `users/{uid}` — profile (`groupId`…) plus the user's own shared data when not in a group. Owner only.
- `users/{uid}/meals/{id}` — meal history without a group. `users/{uid}/private/patient` — patient mode (owner only, never shared).
- `groups/{code}` — family data + `memberUids`, `members`, `blockedUids`, `adminUid`. Only listed members can read it.
- `groups/{code}/meals/{id}` — family meal history, one document per meal (`CollectionSyncEngine`, newest 300 on device).
- `firestore.rules` is tested by `tests/rules.test.ts`; change both together.

## Hooks

- `useAppState` — recipe/split/family data and handlers (orchestrator).
- `useSession` — auth, profile, group membership and group operations.
- `useCloudSync` / `useCollectionSync` — React wrappers of the two sync engines in `src/sync/`.
- `usePatientState` — patient mode (private). Dose maths in `src/utils/bolus.ts` (pure, tested): never put dosing logic in components.
- `useConsent`, `useInstallPrompt` — small single-purpose hooks.

## Tests

`npm test` runs the unit tests (Node test runner through `tsx`): merge rules, a simulated multi-device
sync (`src/sync/*.test.ts`, includes offline/restart and fuzz tests), split maths, dose maths, history, voice parsing,
Alexa signature verification and the sign-in proxy. `npm run test:rules` and `npm run test:e2e` use the Firebase emulators.

## Important Notes

- All weight/carb maths of the split lives in `src/utils/split.ts` (`computeSplit`, `memberFraction`) and is shared by `RecipeTab` and `SplitTab` — do not duplicate it in components
- Meal history is always kept sorted newest-first and capped (`src/utils/history.ts`); use `upsertHistory` to add entries
- `cachedTotalCarbs` ensures the split tab shows carbs even after the recipe form is cleared
- The stats panel classifies meals by timestamp hour (6-11=breakfast, 11-16=lunch, 16-23=dinner)
- The legal notice follows RGPD/LOPDGDD two-layer information system
- TypeScript runs in strict mode (`npm run lint`); numeric fields use `components/NumberInput`
