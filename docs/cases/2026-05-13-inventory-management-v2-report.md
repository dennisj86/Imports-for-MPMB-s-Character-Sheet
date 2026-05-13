# Inventory Management V2 Report

Date: 2026-05-13  
Case: `inventory-management-v2`

## Implemented

### Scope A: Item Management
- Extended inventory item model with:
  - `itemType` (`weapon`, `armor`, `shield`, `gear`, `tool`, `focus`, `consumable`, `ammunition`, `magic-item`, `spell-component`, `custom`)
  - `notes`
- Added service-level inventory operations in `equipmentState.ts`:
  - `addInventoryItem`
  - `updateInventoryItem`
  - `removeInventoryItem`
  - `duplicateInventoryItem`
  - `adjustInventoryItemQuantity`
  - `consumeInventoryItem`
- Kept equipped/stowed flow on existing equip/unequip path and preserved AC/weapon profile compatibility.

### Scope B: Consumables
- Consumable/ammo/component items now support quantity adjustments and `Use`.
- `Use` decrements quantity and removes item at zero.
- Added play-log event recording for item usage:
  - new play event type `inventory-item-use`
  - shown in `PlayLogPanel`.

### Scope C: Ammunition Tracking
- Added dedicated `ammunition` grouping in inventory view model.
- Added ranged weapon ammo hinting in `ActionRollPanel`:
  - detects trackable ranged/ammunition weapons
  - resolves matching ammo item heuristically when possible
  - otherwise shows “Ammo tracking available” reminder.
- No automatic forced ammo spend on attack flow.

### Scope D: Currency Normalization
- Added denomination normalization path:
  - `normalizeCurrencyDenominations`
  - `applyCurrencyNormalization`
- Added currency transaction support:
  - `applyCurrencyTransaction(mode add/subtract, denomination, amount, note)`
  - optional transaction history in inventory state (`currencyTransactions`)
- Added play-log event for currency actions:
  - new play event type `currency-transaction`.

### Scope E: Spell Material Components
- Added inventory-side “Needed for prepared spells” section.
- Material detection from local spell description content:
  - parses `Components:` lines / `M(...)` / material mentions when available.
- Per requirement entry:
  - spell name
  - component text
  - status: `present`, `missing`, `covered-by-focus`, `unknown`
- Focus/component pouch coverage detection via item type/name heuristics.
- Added “Add to inventory” action creating `spell-component` items with note context.

### Scope F: Item Detail Drawer
- Inventory item details continue to use `RuleDetailDrawer`.
- Extended detail fields for item workflows:
  - quantity
  - use/consume status
  - notes
  - automation status/manual instructions/known limitations for consumables and magic items.

### Scope G: Inventory UX
- Inventory panel reworked with:
  - search + equipped/stowed filter
  - grouped sections:
    - Equipped
    - Weapons
    - Armor/Shields
    - Consumables
    - Ammunition
    - Tools/Focus
    - Spell Components
    - Other
  - Add Item modal (not a permanent full form wall)
  - Edit / Duplicate / Delete controls
  - Quantity +/- controls
  - Currency transaction controls and recent transaction list.

## Data / Persistence / State
- Updated domain and persistence schemas:
  - `InventoryItem` new fields (`itemType`, `notes`)
  - `InventoryState.currencyTransactions`
  - play event enum + persistence schema with `inventory-item-use` and `currency-transaction`.
- Kept backward compatibility for existing inventory data paths.

## Tests
- Added `src/tests/inventory-management-v2.test.ts` with 16 checks covering:
  1. add item
  2. edit item
  3. delete item
  4. consumable quantity/use behavior
  5. play log entry on consume
  6. ammunition grouping
  7. currency normalization
  8. currency transaction add/subtract
  9. spell material detection
  10. add missing component to inventory
  11. focus/component pouch coverage
  12. equipped armor/shield AC stability
  13. equipped weapon attack profile stability
  14. magic item automation status visibility
  15. builder spell-choice regression anchor
  16. roll trust / attack flow regression anchor

## Validation
- `npm run test -- --run` ✅ (51 files, 304 tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Non-Goals Kept
- No encumbrance/weight-limit engine
- No container system
- No shop/economy automation engine
- No new rule engine
- No full magic-item effect engine
- No combat target/party/encounter engine
- No MPMB hook execution
