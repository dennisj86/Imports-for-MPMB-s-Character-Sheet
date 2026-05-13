# Roll Trust + Automation Settings V1 Report

Date: 2026-05-13  
Case: `roll-trust-automation-settings-v1`

## Implemented

### Scope A: Automation Settings
- Added persistent per-character automation settings in play state:
  - `rollBonuses`: `manual | suggest | autoApply`
  - `activeEffects`: `manual | suggest | autoApply`
  - `resourceSpending`: `ask | autoSpendWhenSafe | neverAutoSpend`
  - `onHitRiders`: `ask | autoSuggest | manualOnly`
  - `concentration`: `manual | suggestCheck | autoPromptOnDamage`
  - `deathSaves`: `autoApplyResult | askBeforeApply`
- Added normalization + defaults (safe/assist-first).
- Added Manage-tab settings UI with concise explanations and persisted updates.

### Scope B: Roll Breakdown / Trust Drawer
- Extended roll result model with `trustBreakdown`.
- `rollAndRecord` now enriches every roll with trust data:
  - base dice / base roll
  - ability/proficiency modifier context (when available)
  - item/feature/temporary modifier groupings
  - selected optional effects
  - resources spent / not spent
  - manual/unsupported notes
  - final total
- `RollResultCard` now has expandable **Roll Breakdown** details.

### Scope C: Optional Effect Handling
- Character sheet roll pipeline now resolves optional effects by settings strategy:
  - `manual`: only user-selected effects apply
  - `suggest`: only selected effects apply, remaining matching effects are surfaced as suggestions
  - `autoApply`: unambiguous matching effects auto-apply
- Added effect origin tracking (`manual`, `auto`, `suggested`) into roll metadata/logging.
- `until-used` / `one-roll` effects are still consumed only when actually applied via selected effect IDs.

### Scope D: Resource Spend Trust
- Added spend mode handling in roll execution:
  - `manual`
  - `auto-safe`
  - `auto-unsafe`
- Auto spend only executes when:
  - path is safe
  - setting is `autoSpendWhenSafe`
  - resource exists and is not depleted
- Otherwise a blocked spend event is logged with explicit reason (`manual-setting` or `unsafe-path`).
- Attack rider flow uses the new resource trust path and records manual/unsafe notes in roll metadata/breakdown.

### Scope E: Concentration / Damage Prompt Foundation
- Added concentration-check prompt event on damage while concentrating (per setting):
  - `concentration-check-prompt`
  - DC calculation: `max(10, floor(damage / 2))`
- Added overview UI prompt with a direct **Roll Concentration Save** action.
- Prompt and roll outcome are visible via play log/roll history.

## Supporting Updates
- Play-state schema + persistence updated for:
  - automation settings
  - new play event types (`automation-settings-update`, `concentration-check-prompt`)
- Play log descriptions updated for:
  - effect origins
  - resource spend outcome/reason
  - concentration prompts

## Tests
- Added: `src/tests/roll-trust-automation-settings-v1.test.ts` (12 checks), covering:
  1. settings persistence
  2. trust breakdown presence/content
  3. suggest/auto wiring for optional effects
  4. until-used consumption only on apply
  5. non-matching optional effect filtering
  6. unsafe auto-spend blocking
  7. safe auto-spend execution
  8. play log origin visibility
  9. death save auto-apply branch presence
  10. concentration prompt after damage
  11. attack flow regression anchors
  12. active effects dock regression anchors

## Validation
- `npm run test -- --run` ✅ (48 files, 258 tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Non-Goals Kept
- No enemy AC / target / encounter engine
- No full combat automation
- No new spell effect engine
- No new broad rules engine/mapping campaign
- No MPMB hook execution
