# Active Buff + Versatile Follow-up Fixes Report

## 1. Goal

Follow-up fixes for:
- active buff source scope
- versatile weapon damage correctness
- self-cast affordance for cantrips

## 2. Implemented Scope

- Active Buff search now resolves from full `engine.spellCatalog` candidates and keeps only dice-based effects.
- Versatile weapon base damage now prefers structured `equipment.damage` data; versatile die stays from `versatile (...)`.
- `Apply effect to self` is now visible for cantrips as well (not only leveled spells).

## 3. Changed Files

- `src/services/rules/activeEffects.ts`
- `src/services/rules/weaponProfiles.ts`
- `src/features/character/components/sheet/SpellbookPanel.tsx`
- `src/features/character/components/sheet/SpellSlotTracker.tsx`
- `src/tests/structured-rule-data-mapping.test.ts`

## 4. Validation

Executed:
- `npm run test -- --run src/tests/structured-rule-data-mapping.test.ts src/tests/roll-workflow.test.ts`
- `npm run typecheck`

Result:
- tests passed (`22/22`)
- typecheck passed

## 5. Known Non-Goals

- no new spell effect engine
- no new target/ally model
- no combat automation expansion
