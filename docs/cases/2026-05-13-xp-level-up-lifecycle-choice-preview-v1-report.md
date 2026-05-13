# XP + Level-Up Lifecycle + Choice Preview V1 Report

Date: 2026-05-13  
Case: `xp-level-up-lifecycle-choice-preview-v1`

## Implemented

### Scope A: XP Management
- Added persistent XP tracking on `CharacterDraft`:
  - `currentXp`
  - `milestoneMode`
  - `levelSource` (`xp | manual`)
  - `lastLevelUpSnapshot` (for undo)
- Added local centralized XP threshold module:
  - `src/services/levelUp/xpProgression.ts`
  - Rules-mode aware threshold resolution (`2014` and `2024`)
  - diagnostics note when local table is used
- Added Manage-tab XP UI:
  - set/add XP
  - level source selector
  - milestone mode toggle
  - next-level threshold and progress bar
  - level-up availability hint

### Scope B: Level-Up Lifecycle
- Added guided level-up lifecycle helpers:
  - `applyLevelUpWithSnapshot`
  - `undoLastLevelUp`
  - `canUndoLastLevelUp`
- Confirm flow:
  1. detect availability from XP
  2. open preview
  3. inspect changes/warnings/choices
  4. confirm level-up or cancel
- Undo flow restores a pre-level snapshot (single-step rollback).

### Scope C: Level-Up Preview Diff
- Added `buildLevelUpPreviewDiff` in `src/services/levelUp/levelUpLifecycle.ts`.
- Preview includes:
  - before/after level
  - HP delta
  - proficiency bonus delta
  - hit-die gain hint
  - new features
  - resource max changes
  - spell slot changes
  - spell known/prepared/cantrip limit changes
  - pending/complete/unsupported/blocked choice status list
  - warnings and unsupported/manual notes

### Scope D: Builder Choice Option Preview
- Added reusable `ChoiceOptionPicker`:
  - `src/features/character-builder/wizard/components/ChoiceOptionPicker.tsx`
  - search/filter
  - hover/focus/tap preview updates
  - keyboard-focus support
  - per-option details drawer
- Replaced generic rule-choice select/checkbox rendering with the picker in `CharacterBuilderPage`.
- Spell/cantrip option previews now show structured detail fields:
  - level, school, casting time, range, duration, concentration/ritual, components, description, upcast hints
- Weapon mastery option previews now show mastery summary/effect hints using local mastery info.

### Scope E: Choice Completion Trust
- Manage + preview surfaces now both expose canonical status language:
  - `pending`, `complete`, `unsupported`, `blocked`
- Preview choice states are derived from canonical choice surface + progression pending choices.

### Scope F: UX
- Level-up flow remains step-by-step with explicit confirm/cancel.
- Unfinished characters remain storable; warnings are surfaced in preview/manage.
- Existing “Open Builder Choices” path remains available.

## Persistence / Schema
- `CharacterDraft` now carries `xp` tracking state.
- Persistence schema/migration/normalization updated in:
  - `src/services/persistence/characterPersistence.ts`
  - defaults in `src/domain/defaults.ts`

## Tests
- Added: `src/tests/xp-level-up-lifecycle-choice-preview-v1.test.ts` (15 checks), covering:
  1. XP set/add
  2. next-level progress
  3. level-up availability detection
  4. level-up preview feature/resource/choice diff
  5. level-up confirm apply
  6. level-up undo restore
  7. HP progression stability after level-up
  8. spell-slot preview changes
  9. cantrip/spell choice picker integration
  10. hover/focus preview behavior
  11. spell detail fields in choice preview
  12. fighting style detail + automation status anchors
  13. weapon mastery effect preview anchors
  14. pending/complete/unsupported/blocked consistency wiring
  15. regression anchors for roll trust / attack flow / rule drawer
- Updated persistence regression:
  - `src/tests/persistence.test.ts` now asserts XP state roundtrip.

## Validation
- `npm run test -- --run` ✅ (49 files, 273 tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Non-Goals Kept
- No new rule engine
- No new spell-effect engine
- No combat target/encounter engine
- No multiclass expansion
- No broad new mapping campaign
- No MPMB hook execution
