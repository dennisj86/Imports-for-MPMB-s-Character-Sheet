# MPMB Runtime Fixes (Capture/Generation)

## Ziel
Restfehler der MPMB-Local-Generierung reproduzierbar beheben, ohne eine vollständige MPMB-Runtime nachzubauen.

## 1. Fehler-Inventar (vorher)
Ausgangslage vor dieser Fix-Phase:
- `parseErrors`: 8
- betroffene Dateien:
  - `WotC material/pub_20141209_DMG.js`
  - `WotC material/pub_20171121_XGtE.js`
  - `WotC material/pub_20180918_WDH.js`
  - `WotC material/pub_20181120_GGtR.js`
  - `WotC material/pub_20211207_SCC.js`
  - `WotC material/pub_20231114_BoMT.js`
  - `WotC material/ua_20190228_Artificer_dupl.js`
  - `WotC material/ua_20190514_Artificer_dupl.js`

Fehlerklassen:
- fehlende Core-Registry-Strukturen (v. a. `MagicItemsList`, `CompanionList`, `CreatureList`)
- fehlende tiefe Defaults (`toNotesPage`, `spellcastingBonus`, `spellChanges`, `source`, `notes`)
- fehlende Base-Kontext-Sichtbarkeit (`Base_*`)
- String-Helper-Problem (`capitalize`) in VM-Kontext

## 2. Umgesetzte Fixes

### A) Load-Reihenfolge und Base-Seeding
- Harte Load-Reihenfolge über Kategorien:
  1. `core-seed`
  2. `published-supplement`
  3. `ua`
  4. `homebrew`
  5. `other`
- Base-Aliase in Sandbox ergänzt:
  - `Base_SourceList`, `Base_ClassList`, `Base_ClassSubList`, `Base_RaceList`, `Base_RaceSubList`
  - `Base_BackgroundList`, `Base_BackgroundFeatureList`, `Base_FeatsList`, `Base_SpellsList`
  - `Base_MagicItemsList`, `Base_WeaponsList`, `Base_ArmourList`, `Base_ArmorList`, `Base_GearList`, `Base_AmmoList`
  - `Base_CreatureList`, `Base_CompanionList`

### B) Fault-tolerante Registries gehärtet
- Neue/erweiterte Minimaldefaults für:
  - `MagicItemsList` (inkl. `toNotesPage`, `spellcastingBonus`, `spellChanges`)
  - `CreatureList` (inkl. `source`, `traits`, `actions`, `features`, `notes`, `scores`)
  - `CompanionList` (inkl. `notes`, `action`, `includeCheck`, `attributes*`)
- `MagicItemsList` erhält verschachtelte Fallbacks für Sub-Variantenzugriffe (`MagicItemsList[MI0][MI2]`), statt Hard-Crash.

### C) Runtime-Shims
- Bereits vorhandene Shims behalten (`AddSubClass`, `AddRacialVariant`, `AddFeatureChoice`, `AddBackgroundVariant`, etc.).
- `capitalize` robust im VM-Kontext gesetzt (Realm-lokal), damit String-Aufrufe in UA-Dateien nicht abbrechen.

### D) Diagnose/Manifest
- Neue Artefakte pro Lauf:
  - `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
  - `data/imports/mpmb-local/manifests/latest-runtime-summary.json`
- Enthalten:
  - Parse-Fehler (strukturiert: Datei, Fehler, Ausdruck, Kategorie, Ursache)
  - Shim-Calls (gesamt + pro Datei)
  - unbekannte Globals (gesamt + pro Datei)
  - Registry-Fallback-Nutzung pro Datei
  - Load-Plan und Seed-Info
  - Datei-Status (`ok`/`error`)

### E) Regression-Checks
- Baseline-Schwellen im Generator verankert (Entity-Mindestzahlen + max. Parse-Fehler).
- Bei Verletzung bricht der Lauf mit Fehler ab (kein stilles Degradieren).

## 3. Ergebnis (nachher)
Aktueller Lauf:
- `parseErrors`: **0**
- `partialFiles`: **0**
- lokale Counts:
  - classes: 15
  - subclasses: 230
  - species: 312
  - backgrounds: 132
  - feats: 227
  - spells: 264
  - equipment: 661

Damit sind die zuvor verbleibenden problematischen Dateien ohne Hard-Crash verarbeitet, inkl. der beiden Artificer-UA-Dateien.

## 4. Tests ergänzt
- `src/tests/mpmb-runtime-fixes.test.ts` prüft:
  - Core-seed-Reihenfolge im Load-Plan
  - Registry-Nutzbarkeit (Class/Background/Spell) ohne Parse-Fehler
  - `AddBackgroundVariant`-Shim-Nutzung
  - ehemals problematische Artificer-UA-Dateien laufen ohne Hard-Crash
  - Regression-Schwellenwerte
  - Subclass-Linking bleibt intakt

## 5. Bekannte Restgrenzen
- Die Sandbox bleibt bewusst deklarativ und emuliert nicht die vollständige PDF-/Sheet-Runtime.
- Imperative Hooks (`eval`, `calcChanges`, `removeeval`) werden weiterhin nicht als Regelengine ausgeführt.
- Daten mit komplexen Laufzeit-Abhängigkeiten können weiterhin `partial/manual/pending` benötigen, werden aber diagnostisch sichtbar.
