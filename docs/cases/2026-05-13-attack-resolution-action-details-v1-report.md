# Attack Resolution Flow + Action Detail Drawers V1 Report

Date: 2026-05-13

## Scope umgesetzt

### A) Attack Resolution Flow
- `Attack + Damage` entfernt und durch einen echten Flow ersetzt:
  1. Attack Roll
  2. Attack Result Anzeige
  3. Hit/Miss/Cancel Confirmation
  4. Bei `Hit`: Damage Roll separat
  5. Bei `Miss`: kein Damage Roll
- Attack- und Damage-Rolls werden über Flow-Metadaten verknüpft (`attackFlowId`, `attackRollResultId`).
- Neuer Play-State Event `attack-resolution` für Hit/Miss/Cancel.

### B) On-Hit Damage Riders
- Einfache Rider-Erkennung ergänzt (lokal, heuristisch):
  - Divine Smite / Paladin's Smite
  - Sneak Attack
- Nach `Hit` werden Rider als Checkboxen angeboten:
  - Zusatzwürfel/Formel
  - Ressourcenkosten-Hinweis
  - Automation Status
  - Manual Hinweis
- Ausgewählte Rider werden als zusätzliche Dice-Modifikatoren in den Damage Roll gegeben.
- Ressourcenverbrauch nur über sicheren Pfad:
  - nur wenn eindeutige Resource-ID auflösbar
  - sonst manuell markiert

### C) Action Detail Drawer
- Jede Action/Bonus Action/Reaction/Resource Card hat jetzt einen `Details`-Toggle.
- Detailbereich enthält:
  - Kurzbeschreibung + volle lokale Beschreibung (falls vorhanden)
  - Timing
  - Source
  - Resource Cost/Recovery (falls vorhanden)
  - Automation Status (`automated`/`partial`/`manual`/`unsupported`)
  - Manual Instructions bei nicht vollautomatischem Status

### D) Action/Profile Dedupe
- Action-Dedupe in `buildCharacterRollView` eingebaut.
- Duplikate wie `Paladin: Divine Sense` vs `Divine Sense` werden zusammengeführt.
- Gemergte Karte kann Aliases/zusätzliche Quellen führen.
- Hidden Duplicates werden als Roll-Diagnostics geführt und im Diagnostics Panel angezeigt.

### E) Weapon Mastery Play Hint
- Weapon Mastery Block auf Weapon Cards bleibt erhalten (Name, Wirkung, Status, Manual Reminder).
- Zusätzlich Mastery-Hinweis direkt im Attack-Result-Flow (`Mastery Hint`).
- Keine automatische Mastery-Kampfeffekt-Engine ergänzt.

## Dateiänderungen

- Geändert:
  - `src/domain/playState.ts`
  - `src/domain/rolls.ts`
  - `src/services/playState/playStateService.ts`
  - `src/services/rolls/rollRequestFactory.ts`
  - `src/features/character/hooks/useCharacterPlayState.ts`
  - `src/features/character/components/sheet/ActionRollPanel.tsx`
  - `src/features/character/components/sheet/PlayLogPanel.tsx`
  - `src/features/character/components/sheet/DiagnosticsPanel.tsx`
  - `src/pages/CharacterSheetPage.tsx`
  - `src/tests/sheet-layout-repair-play-interactions-v1.test.ts`
- Neu:
  - `src/tests/attack-resolution-action-details-v1.test.ts`
  - `docs/cases/2026-05-13-attack-resolution-action-details-v1-report.md`

## Tests

- Neue Tests:
  - `src/tests/attack-resolution-action-details-v1.test.ts`
  - deckt Attack-Flow, Rider-Erkennung, Rider-Dice, safe resource spend, Dedupe, Diagnostics-Surface und Regression-Anker ab.
- Bestehende relevante Regression:
  - `src/tests/sheet-layout-repair-play-interactions-v1.test.ts` auf neuen Flow angepasst.

## Validation

- `npm run test -- --run` ✅ (46 Dateien, 234 Tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Non-Goals eingehalten

- Keine Enemy-AC/Target-/Encounter-Engine
- Keine vollständige Spell-/Combat-Automation
- Keine MPMB-Hook-Ausführung
- Keine breite neue Rule-Mapping-Engine außerhalb minimaler Rider-Erkennung
