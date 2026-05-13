# Rules Coverage L1-5 V2 Report

Date: 2026-05-13  
Case: `rules-coverage-l1-5-v2`

## Implemented

### Scope A: Level 1-5 Golden Fixtures
- Extended `src/tests/support/phbGoldenFixtures.ts` with focus-class L1-5 fixture builders for:
  - Paladin
  - Ranger
  - Barbarian
  - Bard
  - Monk
  - Warlock
  - Wizard
- Added deterministic fixture completion helpers for:
  - background ability choices
  - class skill choices
  - class/subclass selection at L3+
  - spell context selection with preferred spell fallback
  - L4 ASI completion via canonical level-up state (`ability-score-improvement`)
  - rule choices (explicit and first-option fallback where safe)

### Scope B: Coverage Matrix V2
- Added a new matrix model and builder in fixture support:
  - `buildCoverageMatrixV2`
  - per-entry buckets:
    - `automated`
    - `partial`
    - `manual`
    - `unsupported`
  - per-entry `openKnownGaps`
  - flattened `knownGaps` summary
- Matrix is built from the real L1-5 fixture states (not mocked rows).

### Scope C-I: Class Hardening (L1-5)
- Added regression assertions for key class flows in new test suite:
  - Paladin: Lay on Hands, Divine Sense, Channel Divinity, Smite resource path, spell-slot progression
  - Ranger: Fighting Style, Weapon Mastery, spell prep, slot progression
  - Barbarian: Rage resource, Unarmored Defense AC source, Fast Movement at L5
  - Bard: Bardic Inspiration + Font of Inspiration recharge shift at L5
  - Monk: Focus/Ki-equivalent resource, Deflect reaction, Stunning Strike
  - Warlock: Pact Magic slot progression and Magical Cunning
  - Wizard: Arcane Recovery, Ritual Adept, slot progression
- Added explicit L4 ASI completion checks and L5 progression checks for all focus classes.

### Scope J: Fix Strategy Compliance
- Uses structured local content and existing resolver pipelines.
- Unsupported/partial coverage remains explicitly surfaced in matrix gaps.
- No hook execution, no new combat/target engine, no new spell effect engine.

## Tests

Added `src/tests/rules-coverage-l1-5-v2.test.ts` with 14 checks covering:
1. Paladin L1-5 fixtures
2. Ranger L1-5 fixtures
3. Barbarian L1-5 fixtures
4. Bard L1-5 fixtures
5. Monk L1-5 fixtures
6. Warlock L1-5 fixtures
7. Wizard L1-5 fixtures
8. Class-specific hardening regressions (features/resources/actions)
9. L4 ASI completion + L5 progression checks
10. Spellcasting slot + context deterministic selection checks
11. Martial attack-profile/resource checks
12. Coverage Matrix V2 bucket presence
13. Unsupported gaps visibility
14. Direct builder helper coverage for level 5

## Validation

- `npm run test -- --run` ✅ (52 files, 318 tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Non-Goals Kept

- No multiclass expansion
- No full combat/encounter/party/target engine
- No full spell effect engine
- No new broad rule engine
- No MPMB hook execution
- No homebrew expansion work
