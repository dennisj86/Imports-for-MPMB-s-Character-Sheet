# Shield of Faith AC Active Effect Fix Report

## 1. Goal

Fix a runtime AC regression where preparing or selecting the spell `Shield of Faith` incorrectly raised the character's Armor Class by 2.

The intended behavior is narrower:
- prepared or known `Shield of Faith` must not affect AC,
- casting it without targeting self must not affect self AC,
- casting it on self must apply `+2 AC` only while concentration is active,
- ending concentration must remove the bonus.

## 2. Implemented Scope

- Stopped fallback flat-AC parsing from turning spell descriptions into permanent build modifiers.
- Added a declarative `Shield of Faith` spell mapping that emits a concentration-linked active effect instead of a permanent modifier.
- Added target-aware active effect modifier lookup for sheet AC.
- Wired self-targeted active armor-class effects into the combat and inventory AC view models.
- Added a spell-cast UI checkbox for self-applicable armor-class effects.
- Preserved the existing build-state/session-state separation:
  - prepared spells remain build/selection data,
  - active spell effects remain session play-state data,
  - derived AC is not permanently overwritten.

## 3. Changed Files / Modules

- `src/services/rules/ruleDescriptors.ts`
  - Spell sources are excluded from fallback `+X AC` parsing.
- `src/services/rules/mappings/spellMappings.ts`
  - Added declarative `Shield of Faith` active-effect mapping.
- `src/services/rules/activeEffects.ts`
  - Added target override during active-effect instantiation.
  - Added target-aware modifier extraction for active effects.
- `src/services/equipment/armorClass.ts`
  - Accepts concentration context for conditional AC modifiers.
- `src/features/character/viewModels/combatViewModel.ts`
  - Applies self-targeted active AC modifiers to the sheet combat summary.
- `src/features/character/viewModels/inventoryViewModel.ts`
  - Applies the same self-targeted active AC modifiers to Inventory AC breakdown.
- `src/pages/CharacterSheetPage.tsx`
  - Passes play-state into the inventory view model.
- `src/services/playState/playStateService.ts`
  - Allows `castSpell` to instantiate active effects for a specific target scope.
- `src/features/character/components/sheet/SpellSlotTracker.tsx`
  - Adds `Apply effect to self` for castable spells with self-applicable AC effects.
- `src/tests/structured-rule-data-mapping.test.ts`
  - Adds the regression test for prepared, cast-on-other, cast-on-self, and concentration-ended states.

## 4. Domain / Service / UI Changes

`Shield of Faith` is now represented as an active effect with an `armor-class` modifier guarded by `concentration-active`.

The AC bonus only flows into player-facing AC when:
- the effect exists in `playState.activeEffects`,
- the effect target includes `self`,
- `playState.concentration` is active,
- the modifier target is `armor-class`.

The cast UI exposes this through an explicit `Apply effect to self` checkbox. Without that checkbox, the spell can still be cast and tracked as concentration, but it does not modify the current character's AC.

## 5. Tests and Validation

Validation completed successfully:

- `npm run test -- --run src/tests/structured-rule-data-mapping.test.ts src/tests/play-state.test.ts`
- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`

The full test run passed with 38 test files and 174 tests.

## 6. Known Gaps / Deliberately Not Implemented

- No full target/ally system was added.
- No automatic spell effect engine was added.
- No encounter, creature, or party state was added.
- The UI supports a bounded self-target path for AC active effects only.
- Non-self `Shield of Faith` casts are recorded, but they do not model another creature's AC.

## 7. Recommended Next Phase

The next useful phase is a bounded active-effect targeting pass:
- formalize `self`, `selected`, and `global` target scopes in the UI,
- make active effects visible and dismissible from the sheet,
- keep ally/party targeting out of scope until a party model exists.

## 8. Handoff Notes

This fix intentionally keeps spell preparation, derived stats, and session play-state separate. Future spell-effect work should continue using declarative mappings and active effects rather than adding permanent modifiers from spell text.
