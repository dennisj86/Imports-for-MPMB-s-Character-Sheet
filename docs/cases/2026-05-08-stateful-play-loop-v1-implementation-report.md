# Implementation Report: Stateful Play Loop V1

Stand: 2026-05-08

## 1. Ziel und Kontext

Diese Phase hat den Character Sheet V2-Pfad von einer rein abgeleiteten Anzeige zu einer lokal nutzbaren Session-Oberfläche erweitert.

Wichtige Leitplanke war: klare Trennung zwischen
1. Build-/Entscheidungsdaten (`CharacterDraft`),
2. abgeleiteten Werten aus `characterEngine`,
3. persistentem, aber session-orientiertem `playState`.

Der Legacy-Adapter wurde **nicht** wieder als Runtime-Pfad eingeführt.

## 2. Umgesetzter Scope

### 2.1 Domain und Persistenz

Umgesetzt:
- Neues Play-State-Modell in `src/domain/playState.ts` mit:
  - `schemaVersion`
  - `currentHp`, `tempHp`
  - `deathSaves`
  - `spentResources`, `spellSlots`
  - `activeConditions`, `concentration`
  - `playEvents` (append-only, lokal)
  - `lastRestAt`, `updatedAt`
- `CharacterDraft` um `playState` erweitert (`src/domain/character.ts`).
- Default-Draft erzeugt initialen `playState` (`src/domain/defaults.ts`).
- Persistenzschema erweitert (`src/services/persistence/characterPersistence.ts`):
  - v2 lädt optionales `playState` robust,
  - v1->v2 Migration bleibt intakt,
  - alte/inkonsistente Zustände werden über `ensureCharacterPlayState(...)` sicher normalisiert/initialisiert.

### 2.2 Play-State Logik (nicht in UI)

Umgesetzt in `src/services/playState/`:
- `playStateReducer.ts`: zentrale Zustandsübergänge
- `playStateService.ts`: domänenspezifische Operationen
- `restResolver.ts`: Short/Long-Rest-Reset-Plan auf Basis vorhandener Recharge-Metadaten
- `playEventLog.ts`: Event-Erzeugung + bounded append-only log

Abgedeckte Operationen:
- HP: `applyDamage`, `applyHealing`, `setCurrentHp`
- Temp HP: `setTempHp` (nicht ersetzen, wenn kleiner), `replaceTempHp` (explizit)
- Death Saves: success/failure inkl. critical Varianten
- Ressourcen: spend/restore mit clamp
- Spell Slots: spend/restore mit clamp
- Cast Spell:
  - Ritual cast ohne Slotverbrauch,
  - optionaler Slotverbrauch bei Slot-Cast,
  - Konzentration setzen/ersetzen bei Konzentrationszaubern
- Conditions toggle
- Concentration start/end
- `applyShortRest`, `applyLongRest` (V1 konservativ)

### 2.3 Integration in `/sheet/:id` (V2)

Umgesetzt:
- Neuer Hook `useCharacterPlayState` (`src/features/character/hooks/useCharacterPlayState.ts`), integriert mit:
  - `useCharacterEngine` Output,
  - `characterStore.updateCharacter`,
  - Runtime-Kontext aus abgeleiteten Engine-Daten.
- Auto-Bootstrap bestehender Charaktere auf sinnvollen Initialzustand (HP aus `derivedStats.hitPoints.max`) ohne Build-Daten zu mutieren.
- `CharacterSheetPage` erweitert um aktive Session-Bedienflächen:
  - HP/Temp HP/Death Saves
  - Ressourcen-Tracker
  - Spell-Slot-Tracker + Cast-Aktion
  - Conditions Tray
  - Concentration Panel
  - Rest Controls
  - Local Play Log

Neue UI-Komponenten:
- `HitPointControls.tsx`
- `ResourceTracker.tsx`
- `SpellSlotTracker.tsx`
- `ConditionTray.tsx`
- `ConcentrationPanel.tsx`
- `RestControls.tsx`
- `PlayLogPanel.tsx`

## 3. Was jetzt konkret nutzbar ist

Mit einem bestehenden Charakter kann man im Sheet lokal und persistent:
- Schaden/Heilung/HP-Setzung ausführen,
- Temp HP setzen/ersetzen,
- Death Saves verwalten,
- Limited Resources ab-/aufbuchen,
- Spell Slots ab-/aufbuchen,
- Spells casten (inkl. Ritual ohne Slotverbrauch),
- Concentration aktiv verwalten,
- Conditions toggeln,
- Short/Long Rest auslösen,
- letzte Session-Aktionen im Log nachvollziehen.

Alle Änderungen bleiben nach Reload erhalten, weil sie im `CharacterDraft.playState` persistiert werden.

## 4. Tests und Validierung

Neu/angepasst:
- `src/tests/play-state.test.ts` (12 neue Tests)
- `src/tests/persistence.test.ts` angepasst
- `src/tests/domain.test.ts` angepasst

Gezielt abgesichert wurden u. a.:
- Initialisierung aus Engine-Basis
- Damage-Reihenfolge (Temp HP vor Current HP)
- Healing-Clamp auf Max HP
- Temp-HP-Semantik set vs replace
- Resource-/Slot-Clamps und Event-Erzeugung
- Ritual-Cast ohne Slotverbrauch
- Concentration-Setzung/-Ersetzung beim Cast
- Rest-Verhalten ohne Build-Daten-Überschreibung
- Persistenz-Roundtrip inkl. `playState.schemaVersion`
- v1->v2 Migration mit sicherer `playState`-Initialisierung
- Guardrail: Sheet bleibt auf `useCharacterEngine` und ohne Adapter-Import

Lokale Läufe:
- `npm run test -- --run` ✅ (30 Test Files, 102 Tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## 5. Bewusst nicht umgesetzt (Non-Goals dieser Phase)

- Keine vollständige Combat-/Encounter-/Turn-Engine
- Keine Target-/Defense-/Damage-Mitigation-Automation
- Keine vollständige Condition-Mechanik mit Regelwirkungen
- Keine vollständige Multiclass-/Rules-Engine-Erweiterung
- Keine Campaign/Account/Sharing/Sync-Plattform
- Kein Backend-Audit/Event-Sourcing
- Keine Hook-Execution (`eval/removeeval/changeeval/calcChanges`)
- Kein Architektur-Umbau zurück Richtung Adapter/PDF/Open5e-Primärpfad

## 6. Bekannte Lücken und Risiken (V1)

1. Rest-Logik ist konservativ:
   - basiert auf vorhandenen Recharge-Metadaten,
   - `manual/special` wird nicht aggressiv auto-restored,
   - entsprechende Hinweise werden als Notes geführt.
2. Condition-Tracking ist zustandsorientiert, nicht regelwirkungsorientiert:
   - keine automatische Ableitung von Modifikatoren auf Derived-Werte.
3. Cast-Flow ist absichtlich pragmatisch:
   - kein vollständiger Zauberauflösungsautomat,
   - keine vollständige Validierung aller Sonderfälle.
4. Play-Event-Log ist lokal und bounded:
   - kein revisionssicheres, serverseitiges Audit.

## 7. Nächste sinnvolle Folgephase

Empfohlene Folgephase: **Stateful Play Loop V1.5 / V2 Hardening**

Ziel:
- V1 stabilisieren, ohne Scope-Sprung in Plattformthemen.

Sinnvolle nächste Schritte:
1. Rest-Regeln verbessern (insb. deklarative Edge Cases pro Ressource/Slotpool).
2. Spell-Cast UX präzisieren (Slotwahl-Validierung, bessere Konzentrationsübergänge).
3. Condition-Taxonomie vereinheitlichen (IDs/Presets/Filter).
4. Kleine Guardrails im CI ergänzen (Play-State-Pfade + Import-Checks).

Nicht Ziel der Folgephase:
- Keine neue große Architekturwelle,
- kein Einstieg in Campaign/Accounts/Realtime/Sync.

## 8. Relevante geänderte Bereiche (für Research-Review)

- Domain:
  - `src/domain/playState.ts`
  - `src/domain/character.ts`
  - `src/domain/defaults.ts`
- Persistenz:
  - `src/services/persistence/characterPersistence.ts`
- Play-State Services:
  - `src/services/playState/*`
- Hooks:
  - `src/features/character/hooks/useCharacterPlayState.ts`
  - `src/features/character/hooks/index.ts`
- Sheet:
  - `src/pages/CharacterSheetPage.tsx`
  - `src/features/character/components/sheet/*`
- Tests:
  - `src/tests/play-state.test.ts`
  - `src/tests/persistence.test.ts`
  - `src/tests/domain.test.ts`
