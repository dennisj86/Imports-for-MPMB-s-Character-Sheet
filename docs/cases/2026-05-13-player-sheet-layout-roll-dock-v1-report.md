# Player Sheet Layout + Persistent Roll Dock V1 Report

Date: 2026-05-13

## Scope umgesetzt

### A) Persistent Roll Dock
- Neue Komponente: `src/features/character/components/sheet/PersistentRollDock.tsx`
- Enthält:
  - Free Dice Roller (`d20`, `d4/d6/d8/d10/d12/d100`, freie Formel)
  - Death Save Shortcut
  - Last Roll (`RollResultCard`)
  - Active Buffs / Optional Buffs
  - einklappbares Play Log (default hidden)
- Layout:
  - Desktop: rechte sticky Dock-Spalte
  - Mobile/Tablet: kompakter sticky/fixed Bottom Dock

### B) D&D-Beyond-artige Action Groups
- `ActionRollPanel` vollständig auf gruppierte Struktur umgebaut:
  - Attacks
  - Actions
  - Bonus Actions
  - Reactions
  - Resources
  - Ability Checks
  - Saving Throws
  - Skill Checks
- Jede Gruppe mit:
  - Count Badge
  - Collapse/Expand
  - Search-kompatibler Filterung
- Wichtige Combat-Gruppen oben priorisiert.

### C) Overview kompakter
- Overview neu als kompaktes Dashboard (`Overview Dashboard`) organisiert:
  - HP/Temp HP/Death Saves
  - AC Breakdown
  - Initiative/Speed/Proficiency/Passives
  - Conditions + Concentration
  - Resource Highlights (kompakt)
  - Quick Rest Controls
- Vertikale Last reduziert; Detailflächen liegen weiter in Actions/Features/Manage.

### D) Roll Result Nähe
- Last Roll bleibt dauerhaft im Roll Dock sichtbar.
- Zusätzlich: Action Cards zeigen jetzt inline ein kurzes Last-Result-Snippet, wenn der letzte Wurf zu dieser Aktion gehört (`requestId`-Match), inkl. Breakdown (d20/mod/effects/temporary/total).

### E) UI Cleanup
- Custom Buff Editor bleibt default eingeklappt.
- Diagnostics bleiben hinter `DiagnosticsDrawer` versteckt.
- Technische Rohflächen bleiben aus der normalen Player-UI raus.
- Layout mit `min-w-0`, gruppierten Panels und responsive Dock-Struktur gegen horizontale Ausbrüche abgesichert.

## Dateiänderungen

- Neu:
  - `src/features/character/components/sheet/PersistentRollDock.tsx`
  - `src/tests/player-sheet-layout-roll-dock-v1.test.ts`
  - `docs/cases/2026-05-13-player-sheet-layout-roll-dock-v1-report.md`
- Geändert:
  - `src/features/character/components/sheet/ActionRollPanel.tsx`
  - `src/pages/CharacterSheetPage.tsx`

## Tests

- Neue Testdatei:
  - `src/tests/player-sheet-layout-roll-dock-v1.test.ts`
  - prüft Dock-Integration, Dock-Inhalte, Action-Gruppierung, Buff-Pipeline-Hookup, Diagnostics/Custom-Buff-Defaults.

## Validation

- `npm run typecheck` ✅
- `npm run test -- --run` ✅ (44 Dateien, 219 Tests grün)
- `npm run build` ✅

## Non-Goals eingehalten

- Keine neue Rule Engine
- Keine neuen Rule Mappings
- Keine neuen Active Effects/Automationen
- Keine Combat-/Party-/Target-/Encounter-Engine
- Keine MPMB-Hook-Ausführung
