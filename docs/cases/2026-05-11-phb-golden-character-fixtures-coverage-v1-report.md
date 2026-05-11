# PHB Golden Character Fixtures + Coverage Matrix V1

## Scope

Implemented a real-content PHB-style golden-fixture test matrix plus an explicit coverage matrix for the existing resolver/engine pipeline.

New tests:

- `src/tests/golden-character-fixtures.test.ts`
- `src/tests/phb-coverage-matrix.test.ts`
- shared fixture support in `src/tests/support/phbGoldenFixtures.ts`

## Fixture Set

Added stable 2024 fixture coverage for:

- Fighter
- Paladin
- Cleric
- Bard
- Rogue
- Wizard
- Barbarian
- Ranger

Each fixture is built from a real `CharacterDraft` and resolved through the existing engine path:

- `resolveCharacterEngineState`
- `resolveCharacterWizardState`
- `resolveCombinedRuleProficiencies`
- `buildWeaponAttackProfiles`
- `buildPlayStateRuntimeContext`

## What Is Covered

The golden fixtures now assert real regression values across:

- ability scores and modifiers
- max HP and hit dice
- AC
- saves
- skills
- tool / language / weapon / armor proficiencies
- class skill choices
- feature choices
- origin feat / feat subchoices
- spell / cantrip selection contexts
- resources and actions
- weapon attack and damage profiles
- spell attack and spell save DC
- active effect flows where relevant

Regression cases covered explicitly:

- Magic Initiate filtering by chosen spell list
- Fighting Style application on real fixtures
- Weapon Mastery required count and weapon-only option surface
- Defense AC modifier
- Dueling damage modifier
- Archery attack modifier
- skill / tool / language derived data
- weapon / armor proficiency effects on profiles
- Shield of Faith as self AC active effect
- Bardic Inspiration external-buff activation and optional use
- versatile weapon damage on longsword

## Minimal Engine Hardening

To keep the real-content fixtures stable, two small deterministic fixes were added:

1. `src/services/rules/weaponProfiles.ts`
   - use structured `weaponList === "ranged"` to classify ranged weapons
   - normalize plural weapon proficiency labels such as `Rapiers`, `Quarterstaffs`, etc.

2. `src/services/data/appliedRulesResolver.ts`
   `src/services/data/builderWizardResolver.ts`
   - fix `Any skill` normalization so bard-style free skill choices resolve correctly

No hooks or runtime `eval` paths were introduced.

## Coverage Matrix

The explicit matrix documents:

- tested class set
- tested choice types
- tested apply paths
- tested modifier paths
- known intentional gaps

Known gaps currently documented instead of faked:

- Barbarian unarmored defense is not yet mapped in the actual-content AC path
- some text-derived tool proficiencies still normalize coarsely
- Magic Initiate builder subchoices are deterministic, but the canonical rule-choice surface does not fully mirror completion yet

## Validation

- `npm run test -- --run` ✅
- `npm run typecheck` ✅
- `npm run build` ✅

Validation result after this phase:

- `41` test files passed
- `201` tests passed

Build note:

- Vite still reports the existing chunk-size warning for the main bundle, but the build completes successfully.
