# Active Buff Targeting + Versatile Weapon V1 Implementation Report

## 1. Ziel der Phase

Ziel war die Korrektur von vier produktrelevanten UX-/Regelfehlern:

- Self-Cast-Targeting fuer spell-basierte Active Effects im produktiven Spellbook-Flow
- externe Buff-Aktivierung (z. B. Buff von anderem Caster) ohne Workaround
- konsistentes Verhalten bei Concentration-Replacement (keine mehrfach aktiven concentration-linked Buffs)
- bedienbare Auswahl fuer `versatile`-Waffen (einhand/zweihand) im Actions-Flow

## 2. Umgesetzter Scope

- `SpellbookPanel` unterstuetzt jetzt `Apply effect to self` beim Cast fuer Spells mit Active-Effect-Definition.
- `Actions` zeigt `Optional Active Effects` nur noch fuer rollrelevante Effects mit `target=self|global`.
- Neuer `Active Buffs`-Bereich im Actions-Tab:
  - aktive Effekte anzeigen
  - aktive Effekte manuell dismissen
  - externe Buffs per Spell-Suche aktivieren (`Activate on self`)
- Concentration-Replace fixt das State-Verhalten:
  - beim Start einer neuen Concentration werden vorherige concentration-linked Effects dismissed
- `versatile`-Waffen:
  - einhand/zweihand Umschaltung im Action-Row
  - Damage-Dice werden entsprechend umgeschaltet (z. B. `1d8` <-> `1d10`)

## 3. Geaenderte Dateien/Module

- `src/features/character/components/sheet/ActionRollPanel.tsx`
- `src/features/character/components/sheet/SpellbookPanel.tsx`
- `src/features/character/components/sheet/PlayLogPanel.tsx`
- `src/features/character/hooks/useCharacterPlayState.ts`
- `src/pages/CharacterSheetPage.tsx`
- `src/services/playState/playStateReducer.ts`
- `src/services/playState/playStateService.ts`
- `src/services/rules/activeEffects.ts`
- `src/services/rules/weaponProfiles.ts`
- `src/tests/structured-rule-data-mapping.test.ts`
- `src/tests/generic-rules-choice-modifier-pipeline.test.ts`

## 4. Neue/angepasste Domain-, Service- oder View-Model-Strukturen

- Neue Service-API in Play-State:
  - `addActiveEffectFromSpell(...)`
  - `dismissActiveEffect(...)`
  - `AddActiveEffectOptions`
- Erweiterte Active-Effect-Utilities:
  - `resolveActiveEffectSpellCandidates(...)`
- `cast-spell`-Reducer-Flow dismissed concentration-linked Effects bei Concentration-Replacement.
- Weapon-Profile erweitert um `versatileDamageDice`.

## 5. UI-Aenderungen

- `Spells`:
  - Self-Target-Checkbox fuer effect-faehige Spells
- `Actions`:
  - `Active Buffs`-Liste mit Dismiss
  - `Activate External Buff`-Suche
  - `Optional Active Effects` nur noch fuer relevante self/global Roll-Effects
  - `versatile`-Usage-Selector in Weapon-Action-Rows

## 6. Tests und Validierungsergebnisse

Neue/erweiterte Regressionen:

- Concentration-Replacement dismissed alte concentration-linked Effects
- externer Self-Buff (Shield of Faith) wirkt ohne lokale Concentration-Tracking-Abhaengigkeit
- `versatile`-Alternative Damage-Dice werden aus Weapon-Definition extrahiert

Ausgefuehrt:

- `npm run test -- --run src/tests/structured-rule-data-mapping.test.ts src/tests/generic-rules-choice-modifier-pipeline.test.ts src/tests/roll-workflow.test.ts`
- `npm run typecheck`
- `npm run test -- --run`
- `npm run build`

Ergebnis:

- Tests gruen (`38` Test-Dateien, `177` Tests)
- Typecheck gruen
- Build gruen

## 7. Bekannte Luecken / bewusst nicht umgesetzt

- Keine vollstaendige Target-/Ally-Engine fuer spell effects
- Keine automatische Combat-Automation fuer Weapon Mastery-Effekte
- `versatile`-Umschaltung fokussiert auf Damage-Dice-Umschaltung; keine komplette Re-Resolution aller situativen Modifier-Pfade pro Klick

## 8. Empfohlene naechste Phase

`Active Effect Targeting V2 (bounded)`:

- explizite Target-Scopes im Play-State-UI (`self`, `selected`, `global`)
- saubere Edit-/Retarget-Funktion fuer laufende Active Effects
- optionales Compact-Panel fuer externe Buff-Dauer/Notizen

## 9. Hinweise fuer den naechsten Codex-/Research-Handoff

- Runtime-Pfade bleiben V2 (`useCharacterEngine` + `useCharacterPlayState`)
- kein Adapter-Rueckfall und keine MPMB-Hook-Ausfuehrung
- relevante Logik liegt in Services/Hooks, nicht in grossen UI-Komponenten versteckt
- Datentrennung bleibt erhalten:
  - Build/Character-State (Ausruestung/Choices)
  - Derived Engine Output
  - Session-Play-State (HP/Slots/Conditions/Effects/Log)
