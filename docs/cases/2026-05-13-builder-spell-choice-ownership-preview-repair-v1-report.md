# Builder Spell Choice Ownership + Choice Preview Repair V1 Report

Date: 2026-05-13  
Case: `builder-spell-choice-ownership-preview-repair-v1`

## Implemented

### Scope A: Choice Preview Rendering Bugfix
- Hardened preview/detail rendering in `ChoiceOptionPicker`:
  - switched from multi-open map state to single `detailOptionId`
  - kept a single active `previewOptionId`
  - closes stale detail target when filtered option disappears
- Stabilized drawer entry keys in `RuleDetailDrawer` to avoid duplicate-key reflow artifacts when labels repeat.
- Result: hover/focus/tap updates replace preview state instead of appending duplicate blocks.

### Scope B: Shared Spell Option Preview
- Added reusable spell preview model/component:
  - `src/features/character-builder/wizard/components/SpellOptionPreview.tsx`
- Provides consistent structured spell detail fields:
  - name, level, school, casting time, range, duration
  - concentration/ritual, components, description, at-higher-levels
  - automation status + manual/limitations guidance
- Reused shared spell summary/detail helpers from generic choice rendering.

### Scope C: Spell Choice Ownership
- Shifted builder ownership semantics:
  - Feat UI keeps feat and non-spell parent selections
  - concrete spell/cantrip picks are handled in Spells tab contexts
- Updated Feat section to show spell-choice status summary + CTA:
  - “Complete spell choices in Spells”
- Spells tab now renders dedicated context blocks (class pool, Magic Initiate cantrips/level-1, feature/feat granted contexts) with search + preview.

### Scope D: State Synchronization
- Character builder now derives:
  - visible canonical choices
  - spell-owned choices (`spell`/`cantrip`)
  - non-spell choices
- Feats step uses non-spell canonical choices only; spell-owned choices are surfaced in Spells flow.
- Review step uses full visible canonical choices, so progress status stays aligned across Builder/Manage/Preview.

### Scope E: Completion Semantics
- Updated builder validation to avoid misclassifying spell/cantrip child choices as unresolved in feat/review gates.
- Canonical completion remains single-source; no parallel shadow spell-selection state paths were added.
- Magic Initiate completion wiring remains based on parent + child canonical status (spell list/ability + 2 cantrips + 1 level-1 spell).

### Scope F: UX and Regression Hardening
- Rich preview retained for large rule-relevant choice lists; no fallback to plain native dropdown for spell-heavy contexts.
- Added explicit regression-safe spell preview metadata handoff from generic builder choice rendering.
- Preserved keyboard/pointer/tap preview behavior in choice rows.

## Tests
- Added: `src/tests/builder-spell-choice-ownership-preview-repair-v1.test.ts` (15 checks), covering:
  1. preview replacement (no append duplicates)
  2. repeated hover no duplicate detail blocks
  3. keyboard focus preview replacement
  4. spells tab preview visibility
  5. Magic Initiate cantrip ownership in Spells tab
  6. Magic Initiate level-1 spell ownership in Spells tab
  7. feat-tab summary/link behavior
  8. spell-tab selection updates feat completion path
  9. spell-tab selection updates manage/progression status
  10. spell-tab selection updates preview status
  11. Magic Initiate completion semantics
  12. no duplicated spell-choice state source
  13. XP/Level-Up lifecycle regression anchor
  14. Rule detail drawer regression anchor
  15. Roll trust regression anchor

## Validation
- `npm run test -- --run` ✅ (50 files, 288 tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Follow-up Fix Included
- Preserved legacy lifecycle preview anchor expectations by explicitly passing spell description and casting/range/duration guidance through `CharacterBuilderPage` into the shared spell detail model, while keeping shared renderer ownership intact.

## Non-Goals Kept
- No new rule engine
- No spell effect engine expansion
- No combat target/encounter engine work
- No multiclass expansion
- No broad mapping campaign
- No MPMB hook execution
