# Alternative AC + Choice Completion Consistency V1

## Scope

Implemented all three requested gap closures:

1. Alternative AC formula support (Barbarian Unarmored Defense)
2. Canonical Magic Initiate choice-completion consistency
3. Tool proficiency text-normalization hardening with diagnostics

No MPMB hook execution (`eval/removeeval/changeeval/calcChanges/stopeval`) was introduced.

## A) Alternative AC Formulas

### What changed

- Extended AC service with an alternative-formula architecture in:
  - `src/services/equipment/armorClass.ts`
- Added formula metadata and resolver:
  - `resolveAlternativeArmorClassFormulas({ classDef, level })`
  - currently maps `Barbarian: Unarmored Defense`
- Formula applied:
  - `AC = 10 + DEX mod + CON mod (+ shield when allowed)`
  - only when no armor is worn
- Armor precedence is preserved:
  - if armor is equipped, armor AC remains authoritative
- AC breakdown now exposes formula/source fields:
  - `alternativeFormulaId`
  - `alternativeFormulaSource`
  - `alternativeFormulaExpression`

### Integration points updated

- `src/services/data/derivedStatsResolver.ts`
- `src/features/character/viewModels/combatViewModel.ts`
- `src/features/character/viewModels/inventoryViewModel.ts`

This keeps Derived/Combat/Inventory AC paths aligned.

## B) Canonical Choice Completion (Magic Initiate)

### What changed

- Hardened MPMB structured-choice hydration in:
  - `src/services/rules/mpmbStructuredChoices.ts`
- Added deterministic fallback selection sync from existing builder selections:
  - spell list from `feat-choice:<featId>:spell-list`
  - spell ability from `feat-choice:<featId>:spell-ability`
  - cantrip/level-1 spell picks from scoped `spell-choice:spell-context:*`

### Result

- Magic Initiate parent choice is now:
  - `pending` when required child choices are missing
  - `complete` when spell list + ability + cantrips + level-1 spell are complete
- Builder/Manage/Review now read the same canonical completion state.
- Hidden duplicates do not block canonical completion.

## C) Tool Proficiency Normalization

### What changed

- Hardened text-derived normalization in:
  - `src/services/data/appliedRulesResolver.ts`
- Added canonicalization patterns for common tool labels and choice-style labels.
- Added ambiguity filtering for non-deterministic tokens (e.g. ability tokens leaking into tool text).
- Added deterministic dedupe by normalized token.
- Added diagnostics surface:
  - `AppliedProficienciesResult.diagnostics` (`src/domain/appliedRules.ts`)
  - propagated into `appliedRules.notes`

### Guarantees

- Duplicates are merged deterministically.
- Ambiguous/non-tool tokens are ignored with diagnostics.
- No fake specific tool proficiencies are invented from unclear text.

## Tests Added/Updated

### New

- `src/tests/alternative-ac-choice-completion.test.ts`
  - Barbarian unarmored AC baseline
  - shield interaction
  - armor precedence over unarmored formula
  - AC breakdown formula/source assertions
  - Magic Initiate pending/complete status checks
  - Builder/Manage/Review consistency checks
  - tool normalization + dedupe + ambiguity diagnostics checks

### Updated

- `src/tests/golden-character-fixtures.test.ts`
  - Barbarian fixture now asserts real Unarmored Defense AC path
  - Wizard fixture asserts canonical Magic Initiate parent completion
- `src/tests/support/phbGoldenFixtures.ts`
  - removed previously documented known gaps for this phase
- `src/tests/phb-coverage-matrix.test.ts`
  - coverage matrix now expects no remaining intentional gaps for these items

## Validation

- `npm run test -- --run` ✅
- `npm run typecheck` ✅
- `npm run build` ✅

Validation result:

- `42` test files passed
- `206` tests passed

Build note:

- Existing Vite chunk-size warning remains, build succeeds.
