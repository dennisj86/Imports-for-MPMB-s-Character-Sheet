# Sheet Layout Repair + Play Interaction Semantics V1 Report

Date: 2026-05-13

## Scope umgesetzt

### A) Layout Repair
- Overview neu strukturiert und entquetscht:
  - `Vitals / HP`
  - `AC & Combat Summary`
  - `Conditions & Concentration`
  - `Resource Highlights`
  - `Proficiencies` (kompakt)
- Keine fixen Card-Höhen eingeführt.
- Resource Highlights auf priorisierte Kernressourcen begrenzt und dedupliziert.
- Info-Visibilität in Highlights reduziert (`ResourceBadge quietInfo`).

### B) Death Save Roll Flow
- Primäre Aktion im Overview integriert: `Roll Death Save`.
- Death-Save-Rolls werden automatisch ausgewertet:
  - `10+` -> success
  - `9 oder weniger` -> failure
  - `nat 1` -> critical-failure (2 Fehlschläge)
  - `nat 20` -> critical-success; danach 1 HP Heilung im vorhandenen Play-State-Modell
- Ergebnis landet weiterhin in Last Roll + Play Log.
- Manuelle Overrides bleiben als sekundäre Optionen erhalten.

### C) Weapon Action Card UX
- Weapon-Aktionen klar getrennt:
  - `Attack Roll`
  - `Damage Roll`
  - `Attack + Damage`
- Buttons größer/lesbarer positioniert.
- Inline-Result an Action Card als strukturierter Snippet:
  - d20
  - modifier
  - effects
  - modifiers
  - total

### D) Weapon Mastery Explanation
- Weapon-Mastery-Informationsblock ergänzt:
  - Mastery-Name
  - kurze Wirkung
  - Automation-Status (`automated`/`manual`/`unsupported`)
  - klare Manual-Hinweise bei nicht automatisierter Wirkung
- Fallback bei fehlender Definition:
  - `Mastery selected, details unavailable.`
  - plus Diagnostics-Zeile bei vorhandener Diagnose.

### E) Roll Dock / Last Roll Layout-Verhalten
- Sheet-Layout auf `lg`-Breakpoint für rechte Dock-Spalte umgestellt.
- Desktop/Tablet: Dock als rechte sticky Spalte.
- Mobile: kompakter Bottom-Dock bleibt, Hauptinhalt erhält ausreichendes Bottom-Padding.
- Play Log bleibt standardmäßig eingeklappt.

### F) Action Groups Cleanup
- Gruppierte Actions mit Collapse/Expand und Suche bleiben erhalten:
  - Attacks, Actions, Bonus Actions, Reactions, Resources, Ability Checks, Saving Throws, Skill Checks.
- Attacks/Actions standardmäßig offen, lange Listen bleiben einklappbar.

### G) Resource Dedupe and Priority
- Neues ViewModel für priorisierte, deduplizierte Overview-Highlights:
  - bevorzugt u. a. Lay on Hands, Channel Divinity, Spell Slots, klassenprägende Ressourcen.
- Spell Slots als aggregierter Highlight-Eintrag.

## Dateiänderungen

- Geändert:
  - `src/pages/CharacterSheetPage.tsx`
  - `src/features/character/components/sheet/ActionRollPanel.tsx`
  - `src/tests/player-sheet-layout-roll-dock-v1.test.ts`
- Neu:
  - `src/tests/sheet-layout-repair-play-interactions-v1.test.ts`
  - `docs/cases/2026-05-13-sheet-layout-repair-play-interactions-v1-report.md`

## Tests

- Neue Testdatei:
  - `src/tests/sheet-layout-repair-play-interactions-v1.test.ts`
  - prüft Overview-Struktur, Resource-Dedupe, Death-Save-Semantik (inkl. nat1/nat20), Weapon-Action-Semantik, Dock-Layout.

## Validation

- `npm run test -- --run` ✅ (45 Dateien, 224 Tests grün)
- `npm run typecheck` ✅
- `npm run build` ✅

## Non-Goals eingehalten

- Keine neue Rule Engine
- Keine neuen Rule Mappings (außer kurzer Mastery-Info-Ableitungen)
- Keine neuen Active Effects
- Keine Combat-/Target-/Party-/Encounter-Engine
- Keine Spell-Automation-Erweiterung
- Keine MPMB-Hook-Ausführung
