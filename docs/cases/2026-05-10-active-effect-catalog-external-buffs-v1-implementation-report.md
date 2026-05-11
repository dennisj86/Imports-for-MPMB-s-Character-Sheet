# Active Effect Catalog + External Buff Activation V1

Date: 2026-05-10

## Scope Delivered

Implemented `ActiveEffectCatalog + External Buff Activation V1` in the existing character builder repo.

Delivered areas:

- Source-agnostic active effect catalog across:
  - spells
  - class features
  - subclass features
  - feats
  - items
  - custom buffs
- External buff activation on self without prepared/known spell dependency
- Roll integration for optional active-effect selection
- Roll result and play-log source/formula visibility
- Active effect lifecycle handling for dismiss and `until-used` / `one-roll`
- Minimal custom buff editor and activation flow
- Persistence-compatible active-effect model expansion

## Architecture Changes

### 1. Active effect model hardening

Extended active effect data with:

- `label`
- `effectType`
- `modifierSummary`
- `configurableFields`
- `sourceCasterName`
- `note`
- `until-used` duration support

This keeps existing spell-driven flows intact while allowing external feature/item/custom effects to use the same runtime path.

### 2. Active effect catalog

Added a catalog builder that resolves effect-capable entries from the filtered snapshot content:

- spell catalog via existing spell effect mapping/fallback parsing
- class/subclass features via declarative rule mappings
- feats via declarative rule mappings
- items via declarative rule mappings

The catalog is deduplicated and exposed as UI-ready entries with source/effect metadata and configuration hints.

### 3. External activation path

Added a generic `addResolvedActiveEffect(...)` play-state entry point.

Existing flows now sit on top of it:

- spell casting still creates spell effects
- external spell activation still works
- feature/item/feat catalog activation now uses the same path
- custom buff activation uses the same path

### 4. Bardic Inspiration support

Added a declarative feature mapping for `Bardic Inspiration`:

- source type: `class-feature`
- effect type: `roll-bonus`
- duration type: `until-used`
- configurable die size
- optional source/caster name

No bard class logic is required on the target character.

### 5. Roll integration and lifecycle

Roll requests now carry selected active-effect metadata.

Roll results and play-log entries now include:

- active effect label/source
- bonus dice source
- applied formula summary

`until-used` and `one-roll` effects are consumed only when the user actually selected them for the roll.

### 6. UI updates

Updated the Actions tab panel to include:

- catalog search across external buffs
- source filters: spells, features, items, custom
- effect filters: all, roll bonus, AC bonus
- optional source/caster name
- optional note
- die-size override for configurable effects
- custom buff editor
- active buff list with dismiss controls

No prepared/known-spell restriction remains on the external buff activation flow.

## Regression Cases Covered

- Bless
- Guidance
- Resistance
- Shield of Faith
- Bardic Inspiration
- Custom/manual roll buffs

## Validation

Executed successfully:

- `npm run typecheck`
- `npm run test -- --run`
- `npm run build`

Results:

- Typecheck passed
- Test suite passed: `38` files, `182` tests
- Production build passed

## Notes

- No MPMB hook execution was introduced.
- No `eval/removeeval/changeeval/calcChanges` runtime path was introduced.
- Shield of Faith self-target AC behavior remains gated by active effect targeting and concentration/external activation semantics.
