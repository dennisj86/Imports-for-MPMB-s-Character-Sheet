# Tabletop Utility UX V1

Date: 2026-05-12

## Scope Delivered

Implemented practical tabletop utilities on top of the stabilized sheet core without adding new rule-engine features or rule mappings.

Delivered:

- Currency management in inventory state and sheet UI (`cp`, `sp`, `ep`, `gp`, `pp`)
- Free dice roller in Actions tab with formula support and death save shortcut
- Custom Buff editor default-collapsed interaction polish
- Reusable `InfoPopover` for short, keyboard-accessible rule hints
- Tooltip/popover wiring for conditions, concentration, spell tags, weapon properties/mastery, active buff duration/status, and resource recharge labels

## A) Currency Management

Implemented currency state in character/inventory context:

- `src/domain/character.ts`: added `CurrencyState`; `InventoryState.currency`
- `src/domain/defaults.ts`: initialized default currency amounts
- `src/services/equipment/currencyState.ts` (new):
  - `normalizeCurrencyState`
  - `setCurrencyAmount`
  - `adjustCurrencyAmount`
  - `currencyTotalInGp`
- `src/services/equipment/equipmentState.ts`:
  - inventory normalization now preserves/defaults currency
  - equip/unequip updates keep currency intact
- `src/services/persistence/characterPersistence.ts`:
  - persistence schema supports inventory currency and legacy/default fallback

Inventory UI additions:

- `src/features/character/components/sheet/InventoryPanel.tsx`
  - currency card with per-denomination display/edit
  - +/- controls (`1` and `10`)
  - total value in gp shown
- `src/pages/CharacterSheetPage.tsx`
  - wired persistent currency set/adjust callbacks

## B) Free Dice Roller

Added Free Dice Roller to Actions:

- `src/features/character/components/sheet/ActionRollPanel.tsx`
  - supports `d20`, `d4/d6/d8/d10/d12/d100`
  - supports formulas like `1d20+5`, `2d6+3`
  - supports custom roll label
  - death save shortcut button
  - validation via `parseDiceExpression`

Results are routed through existing `onRoll` pipeline, so they appear in:

- Last Roll card
- Play Log events

No combat automation was introduced.

## C) Custom Buff UX

Polished custom buff editor behavior:

- `ActionRollPanel` now starts with custom editor collapsed
- `Create Custom Buff` button opens editor
- editor can be closed manually
- after activation, editor resets and closes
- existing custom buff creation/activation logic remains unchanged

## D) Rules Tooltips / Info Popovers

Added reusable component:

- `src/features/character/components/sheet/SheetDesignSystem.tsx`
  - new `InfoPopover` (focus/hover/click/tap friendly)
  - includes `aria-controls`, `aria-expanded`, `role="tooltip"` for accessibility

Rule hint source:

- `src/features/character/components/sheet/rulesInfo.ts` (new)
  - concise summaries for spell tags, condition labels, weapon properties, mastery, buff durations/status, recharge labels, currency denominations
  - fallback to `Details unavailable.`

Wired usage:

- Conditions: `ConditionTray`
- Concentration: `ConcentrationPanel`
- Spell tags: `SpellbookPanel`
- Weapon properties/mastery + active buff duration/status: `ActionRollPanel`
- Resource recharge labels: `ResourceBadge` in `SheetDesignSystem`

## E) Condition Help

Condition hint popovers are now available on condition controls:

- hover/focus/tap enabled via `InfoPopover`
- concise gameplay summaries (no long rules text)
- supports listed conditions through structured hints plus fallback mapping

## Non-Goals / Boundaries Kept

- No new rule engine behavior
- No new rule mappings
- No new active-effect mechanics
- No combat/party/target/encounter engine
- No shop/price/encumbrance engine
- No MPMB hook execution
- No long copyrighted rules text excerpts

## Tests Added / Updated

Added:

- `src/tests/tabletop-utility-ux-v1.test.ts`
  - currency persistence + add/subtract clamp behavior
  - free d20 roll path
  - formula roll path (`1d20+5`)
  - death save shortcut roll logging
  - custom buff editor default-collapsed source assertion + custom buff activation still functional
  - condition/spell/weapon tooltip wiring assertions
  - popover accessibility source assertions

## Validation

Executed successfully:

- `npm run test -- --run`
- `npm run typecheck`
- `npm run build`

Results:

- tests passed: `43` files, `214` tests
- typecheck passed
- build passed

Notes:

- Project scripts regenerated generated content/manifests and build artifacts.
- Existing Vite large-chunk warning remains unchanged from baseline.
