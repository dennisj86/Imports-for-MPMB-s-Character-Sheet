# Level-Up Target Context + Confirm Handler Repair V1

Date: 2026-05-13

## Summary

- Added an explicit level-up target context for Builder preview flows.
- Builder and spell management now resolve against an effective preview level without persisting the character level early.
- Level-up preview deep links now carry `mode=level-up-preview` and `levelUpTarget`.
- Confirm now applies the preview's target level directly instead of recomputing `current + 1`.
- Pending choices remain visible after confirm and reopen in normal committed Builder mode afterward.

## Implemented

### 1. Level-Up Target Context

- Added `src/services/levelUp/levelUpTargetContext.ts`.
- Normalizes:
  - `currentLevel`
  - `targetLevel`
  - `source`
  - optional `pendingChoiceId`
  - optional `focusTarget`
- Parses Builder preview query params:
  - `step`
  - `focus`
  - `levelUpTarget`
  - `mode=level-up-preview`
  - `pendingChoiceId`

### 2. Character Engine Effective Level

- `resolveCharacterEngineState(...)` now computes:
  - `persistedLevel`
  - `effectiveLevel`
  - `resolutionDraft`
  - `levelUpTargetContext`
- Rules, derived stats, progression, action resources, wizard contexts, and spell contexts now resolve from `resolutionDraft`.
- The original `draft` remains unchanged and still reflects the committed character.

### 3. Builder / Wizard Preview Repair

- `CharacterBuilderPage` now detects preview query params and passes the target context into:
  - `useWizardV2State(...)`
  - `useSpellManagement(...)`
- Builder shows preview-level choices while the persisted character level stays unchanged.
- Added preview messaging so the UI states that the level is not committed yet.
- `LevelUpChoicesStep` and Builder review summary now render from the effective preview level.
- Class-step subclass resolution now honors preview level while resolving preview choices.

### 4. Confirm Handler Repair

- `CharacterSheetPage` confirm now uses:
  - `targetLevel: levelUpPreview.toLevel`
- Old recomputation path based on `current + 1` is no longer used for preview confirm.

### 5. Resolve Now / Deep Links

- Builder links can now carry:
  - `levelUpTarget`
  - `mode`
  - `pendingChoiceId`
- Preview entries render a `Resolve now` action that opens the Builder in preview target-level mode.
- Normal post-confirm pending links remain plain committed Builder links.

## Tests

Added:

- `src/tests/level-up-target-context-confirm-repair-v1.test.ts`

Covers:

1. Level-1 preview resolves target level 2.
2. Builder renders level-2 fighting-style choices while persisted level remains 1.
3. Spell/cantrip pending links include preview target params.
4. Confirm applies the preview target level.
5. Pending choices remain visible after confirm.
6. Normal committed Builder links do not keep preview params.
7. Builder, spell management, deep-link, and confirm source wiring is present.

## Validation

- `npm run test -- --run` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `node --check scripts/party-server.mjs` ✅

## Notes

- Existing `data/party-sessions/default.json` and `data/party-sessions/default.bak.json` were left untouched as local runtime state.
- Build still reports the existing Vite CJS deprecation note and chunk-size warning; both are non-blocking.
