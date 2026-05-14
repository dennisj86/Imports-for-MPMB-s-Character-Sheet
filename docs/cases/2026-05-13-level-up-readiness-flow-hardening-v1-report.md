# Level-Up & Readiness Flow Hardening V1

Date: 2026-05-13

## Scope

- Classified unresolved level-up entries into `critical-blocker`, `pending-choice`, `unsupported-manual`, and `informational`
- Relaxed level-up confirm so only critical blockers disable the confirm action
- Added clickable pending-entry actions from the sheet into focused Builder targets
- Added Builder deep-link focus/scroll handling for step + choice targets
- Kept pending/manual/unsupported entries visible after confirm across Sheet, Preview, Builder, and Party Readiness

## Implemented

### Level-Up Preview Hardening

- `buildLevelUpPreviewDiff` now returns:
  - classified choice entries
  - aggregated open entries
  - `canConfirm`
  - `confirmLabel`
- Pending and unsupported entries no longer block confirm by default
- Critical blockers remain explicit and disable confirm

### Pending Entry Actions

- Sheet progression and level-up preview entries now expose direct actions:
  - Fighting Style and similar canonical rule choices open the matching Builder choice surface
  - Spell/Cantrip pending entries open the Builder Spells tab
  - ASI/Feat and HP gain pending entries deep-link to the matching Builder block
  - Unsupported/manual entries open an inline manual/detail hint

### Builder Deep Links

- Added shared Builder deep-link helpers for:
  - step routing
  - stable focus ids
  - per-surface target resolution
- Builder now reads `step` and `focus` query params
- Builder scrolls, focuses, and briefly highlights the target surface

### Feats Step Visibility

- Hardened Wizard V2 step visibility so the `feats` step stays available when it contains:
  - generic rule choices
  - level-up HP/ASI surfaces
  - other non-spell pending choice content

### Readiness Sync

- Progression view-model pending entries now include missing HP gain choices
- Party readiness stays derived from canonical character state and updates after choice completion

## Files

- `src/services/builderDeepLinks.ts`
- `src/services/levelUp/levelUpLifecycle.ts`
- `src/features/character/viewModels/progressionViewModel.ts`
- `src/pages/CharacterSheetPage.tsx`
- `src/pages/CharacterBuilderPage.tsx`
- `src/features/character-builder/wizard/components/SpellChoiceSection.tsx`
- `src/features/character-builder/wizard/components/FeatChoiceSection.tsx`
- `src/features/wizardV2/wizardV2Engine.ts`
- `src/tests/level-up-readiness-flow-hardening-v1.test.ts`

## Validation

- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`
- `node --check scripts/party-server.mjs`
