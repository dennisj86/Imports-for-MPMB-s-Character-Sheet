# Option-Scoped Apply Path V1

Date: 2026-05-11

## Scope Delivered

Implemented deterministic option-scoped apply paths for structured MPMB data without executing MPMB hooks.

Delivered:

- Central option-scoped apply-path service for structured fields
- Deterministic handling for:
  - `scores`
  - `scoresMaximum`
  - `skills`
  - `toolProfs`
  - `languageProfs`
  - `weaponProfs`
  - `armorProfs`
  - simple `addMod`
  - simple `extraAC`
  - simple `action`
  - simple `usages` / `recovery`
- Option-scoped child-choice generation for skill/tool/language selectors
- Derived-stat integration for ability scores, skills, passive scores, initiative, AC, and weapon proficiency
- Action/resource integration for deterministic option-scoped actions and counters
- Diagnostics for applied, unsupported, and choice-required option-scoped fields
- Feature/sheet visibility for applied summaries and combined proficiencies

## Architecture Changes

### 1. Central apply-path service

Added `src/services/rules/optionScopedApplyPaths.ts`.

The service:

- reads only structured option/root data from selected sources
- emits deterministic deltas instead of mutating UI state
- never executes `eval`, `removeeval`, `changeeval`, `calcChanges`, or `stopeval`
- records diagnostics for unsupported or incomplete fields

Outputs include:

- ability-score bonuses and maxima
- proficiency grants
- rule modifiers
- feature-action deltas
- resource deltas
- compact applied summaries

### 2. Rule-engine integration

Integrated option-scoped output into `resolveCharacterRuleEngine(...)`.

Changes:

- structured option-scoped child choices are now emitted through `resolveMpmbStructuredChoices(...)`
- `CharacterRuleEngineState` now carries `optionScoped`
- option-scoped modifiers are merged into the main rule-modifier list
- option-scoped diagnostics are surfaced through rule-engine diagnostics and the diagnostics panel

### 3. Derived stat application

Extended `derivedStatsResolver` to consume option-scoped state.

Delivered behavior:

- `scores` modifies final ability scores
- `scoresMaximum` caps ability scores when present
- score notes now include source breakdown
- combined skill proficiencies/expertise flow into derived skills
- `addMod` applies to supported skill/save/initiative/passive targets
- `extraAC` applies through the normal AC modifier pipeline
- AC evaluation now uses normalized equipped inventory, so armor-conditional option-scoped modifiers evaluate consistently

### 4. Proficiency application

Added combined proficiency resolution for:

- skills
- tools
- languages
- weapons
- armor

This is now used for:

- derived skill proficiency/expertise
- sheet proficiency summaries
- weapon attack-profile proficiency detection

Weapon attacks now only add proficiency when deterministic weapon proficiency is available for the relevant weapon. Existing fallback behavior remains intact when no deterministic weapon set is present.

### 5. Action/resource integration

Extended `actionResourceResolver` to ingest deterministic option-scoped actions/resources.

Supported:

- simple action type tuples
- fixed uses
- proficiency/ability-based uses where already supported by the shared resource parser
- deterministic recharge mapping

Unsupported action/resource shapes remain diagnostics only; no fake counters are created.

### 6. UI and diagnostics

Updated the sheet surface with:

- an `Option-Scoped Apply Paths` diagnostics block
- feature-card summary badges sourced from applied option-scoped entries
- a combined proficiency summary in the sheet overview

This keeps the UI changes narrow while making the applied results visible outside debug-only flows.

## Safety / Non-Goals

Not added:

- MPMB hook execution
- runtime `eval`/`removeeval`/`changeeval`/`calcChanges`
- a new combat/target/party engine
- a generic feat/spell effect engine
- fake resource counters for unsupported `usages` / `recovery`

Hook-like option-scoped fields are explicitly detected and reported as unsupported.

## Regression Coverage

Added focused regression coverage for:

- option-scoped ability-score bonuses and maxima
- skill/tool/language application and dedupe
- weapon/armor proficiency application
- `addMod` on skill/save/initiative/passive score
- `extraAC` conditional application
- deterministic option-scoped actions/resources
- option-scoped child-choice completion and persistence
- hook-like field rejection without fake bonuses

Existing regressions remained green for:

- Magic Initiate filtering
- Fighting Style / Weapon Mastery
- External buff catalog and activation
- Shield of Faith AC active effects
- roll workflow
- legacy persistence and v2 integration flows

## Validation

Executed successfully:

- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`

Results:

- tests passed: `39` files, `191` tests
- typecheck passed
- production build passed

## Notes

- `vite build` still reports the existing large-chunk warning for the main bundle; the build itself is successful.
- Validation rewrote generated MPMB snapshot artifacts and `dist` output as part of the normal repo workflow.
