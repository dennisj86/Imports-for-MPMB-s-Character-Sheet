# Active Effect Catalog Coverage + Search Diagnostics V1

Date: 2026-05-10

## Scope Delivered

Implemented the first diagnostics and coverage pass for the external active-effect catalog without introducing a broader combat, party, or spell-effect engine.

Delivered:

- Search diagnostics for empty catalog searches
- A small `known unmapped` / future-effect catalog for recognizable but unsupported effects
- Alias-aware catalog search across activatable and future/unsupported entries
- Additional PHB-compatible activatable presets that fit the existing active-effect pipeline
- Explicit non-support handling for `Heroic Inspiration`
- Regression coverage for existing external buffs and custom buffs

## Architecture Changes

### 1. Catalog model coverage

Extended the catalog domain with:

- `aliases?: string[]` on activatable catalog entries
- `KnownUnmappedActiveEffectEntry`
- `FutureActiveEffectType` for unsupported/future catalog entries

This keeps activatable effects and future placeholders separate. Unsupported effects can be surfaced in search diagnostics without entering the runtime activation path.

### 2. Search service and diagnostics

Added catalog search infrastructure in `src/services/rules/activeEffects.ts`:

- `searchActiveEffectCatalog(...)`
- `buildKnownUnmappedActiveEffectCatalog()`
- source/effect filter types for the UI
- normalized alias search using slug-style matching

Search diagnostics now return:

- current query
- active source filters
- active effect filter
- searched source types
- mapped-only hint: `Only mapped active effects are searchable.`

Search is no longer exact-name only. It now checks normalized label, source name, aliases, applicable roll types, and effect type text. This allows terms like `hero` to find `Heroic Inspiration` in the future/unsupported catalog.

### 3. Known unsupported / future catalog

Added a small non-activatable catalog for effects that users may search for but that do not fit the current pipeline:

- `Heroic Inspiration`
- `Enhance Ability`
- `Pass without Trace`
- `Warding Bond`

Each entry includes:

- name
- source type
- unsupported reason
- expected future effect type
- aliases for searchability

These entries are displayed in diagnostics/empty-state UI only. They are not activatable active effects.

### 4. Additional activatable presets

Added small declarative presets that fit the existing active-effect model:

- `War God's Blessing`
  - source type: `subclass-feature`
  - effect type: `roll-bonus`
  - flat modifier: `+10`
  - applicable roll types: `attack-roll`
- `Potion of Heroism`
  - source type: `item`
  - effect type: `roll-bonus`
  - dice modifier: `1d4`
  - applicable roll types: attack rolls, spell attacks, saving throws

These were added as rule mappings, not as UI hardcoding.

### 5. Heroic Inspiration handling

`Heroic Inspiration` is intentionally not modeled as bonus dice.

Reason:

- it needs a reroll / replace-result decision path
- that runtime pipeline does not exist in the current roll integration

The effect is therefore searchable as `known unsupported`, but cannot be activated or accidentally applied as a dice bonus.

### 6. Search UX in the Actions panel

Updated the external buff search UI in `ActionRollPanel`:

- uses the shared search service instead of local exact-match filtering
- shows active source/effect filters even when no match is found
- shows searched source-type coverage
- shows the mapped-only hint
- shows `Known but not activatable yet` when future catalog matches exist

This gives users a concrete reason why a search failed:

- filtered out
- not mapped
- recognized, but unsupported by the current runtime

## Regression Cases Covered

Still activatable:

- `Bardic Inspiration`
- `Bless`
- `Guidance`
- `Resistance`
- `Shield of Faith`
- custom buffs

Intentionally non-activatable:

- `Heroic Inspiration`

## Tests Added / Verified

Covered in `src/tests/structured-rule-data-mapping.test.ts`:

- Bardic Inspiration remains activatable
- Bless / Guidance / Resistance remain activatable
- Shield of Faith remains correct as an AC active effect
- unknown search terms return helpful diagnostics
- known unsupported searches return future/unsupported results
- `Heroic Inspiration` is not exposed as an activatable dice bonus
- filter diagnostics expose active source/effect filters
- custom buff flows still work

## Validation

Executed successfully:

- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`

Results:

- test suite passed: `38` files, `184` tests
- typecheck passed
- production build passed

## Notes

- No MPMB hook execution was added.
- No `eval`, `removeeval`, `changeeval`, or `calcChanges` runtime path was added.
- No new party, target, turn, or full spell-effect system was introduced.
