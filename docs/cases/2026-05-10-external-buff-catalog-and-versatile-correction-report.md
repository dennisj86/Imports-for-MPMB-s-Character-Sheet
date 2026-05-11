# External Buff Catalog + Versatile Correction Report

## 1. Goal

Fix follow-up issues:
- external buff search still felt restricted to own spells
- versatile damage showed wrong same die for one-hand/two-hand
- self-cast affordance missing for cantrip rows

## 2. Implemented Scope

- External buff candidates now include all effect-capable spells from active spell catalog (not dice-only).
- External buff list now requires a short query before showing results (avoids misleading short top list).
- Weapon profile now uses structured `damage` as base die and `versatile(...)` as alternate die.
- `Apply effect to self` remains available in spell rows including cantrips.

## 3. Changed Files

- `src/services/rules/activeEffects.ts`
- `src/services/rules/weaponProfiles.ts`
- `src/features/character/components/sheet/ActionRollPanel.tsx`
- `src/tests/structured-rule-data-mapping.test.ts`

## 4. Validation

- `npm run test -- --run src/tests/structured-rule-data-mapping.test.ts`
- `npm run typecheck`

Both passed.

## 5. Non-Goals

- no new spell effect engine
- no ally/target model expansion
- no combat automation expansion
