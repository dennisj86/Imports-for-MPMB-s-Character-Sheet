# Vergleich 2014 vs 2024 und Wizard-Machbarkeit

Stand: 2026-05-05  
Scope: `docs/Sheet skripte`, `docs/Sheet skripte 2024`, `WotC material`, `WotC 2024`, aktueller Builder-Code im Repo

## 1) Wie unterscheiden sich die beiden Regelwerks-Ordner?

Kurz: `docs/Sheet skripte 2024` ist funktional ein erweitertes/modernisiertes Set gegenueber `docs/Sheet skripte` (2014-Basis).

- Dateien gesamt:
  - 2014: `143`
  - 2024: `149`
- Gemeinsame Dateinamen: `143`
- Nur in 2024 vorhanden: `6`
  - `README.md`
  - `Skriptanalyse.md`
  - `_functions/FunctionsHelpers.js`
  - `_variables/ListsEvals.js`
  - `additional content syntax/calculation changes - default calcChanges (DefaultEvalsList).js`
  - `additional content syntax/weapon mastery (WeaponMasteriesList).js`
- Von den 143 gemeinsamen Dateien sind:
  - `115` byte-identisch
  - `28` inhaltlich unterschiedlich (vor allem Core-Logik und Core-Listen)

Grosse technische Aenderungen liegen in:
- `_functions/*` (u.a. `Functions1.js`, `FunctionsSpells.js`, `FunctionsImport.js`)
- `_variables/*` (u.a. `ListsClasses.js`, `ListsRaces.js`, `ListsSpells.js`, `ListsGear.js`, `ListsSources.js`)

## 2) Inhaltlicher Vergleich (Base-Listen)

| Bereich | 2014 (`docs/Sheet skripte`) | 2024 (`docs/Sheet skripte 2024`) |
|---|---:|---:|
| Klassen | 12 | 12 |
| Subklassen | 12 | 12 |
| Species/Races | 9 | 9 |
| Race-Varianten | 10 | 22 |
| Backgrounds | 1 | 4 |
| Background-Features | 1 | 4 |
| Feats | 1 | 16 |
| Spells | 319 | 366 |
| Creatures | 131 | 101 |
| Magic Items | 240 | 239 |
| Companion-Templates | 4 | 4 |
| Base Sources | 5 | 2 |

Quellen-Logik:
- 2014: `SRD`, `HB`, plus Legacy/AL-bezogene Quellen (`DMguild`, `ALbackground`, `AL-legal`)
- 2024: klar auf `SRD24` + `HB` reduziert

Neue 2024-spezifische Schwerpunkte:
- Weapon Masteries (eigene Listen/Syntax vorhanden)
- zusaetzliche Eval-/Calc-Ablagen (`ListsEvals.js`, Default-calcChanges-Syntax)

## 3) Was bringen `WotC material` und `WotC 2024` zusaetzlich?

- `WotC material`: `135` Dateien (2014-era + spaetere Publikationen + UA-Bundles)
- `WotC 2024`: `4` Dateien:
  - `pub_20240917_PHB.js`
  - `pub_20250218_MM.js`
  - `not-reprinted_20140819_PHB.js`
  - `not-reprinted_20201117_TCoE.js`

Das ist ein brauchbares Fundament, um 2024-Core plus nicht-neugedruckte Legacy-Optionen zusammenzufuehren.

## 4) Kann man daraus einen voll funktionsfaehigen Wizard bauen?

### Kurzantwort
Ja, **datenmaessig weitgehend**.  
Nein, **regel- und automationsseitig noch nicht vollstaendig** im aktuellen lokalen Builder.

### Warum nicht vollstaendig (aktueller Stand im Repo)?

Der lokale Builder (React/TS MVP) hat bewusst Grenzen:
- Imperative MPMB-Hooks werden bei Ingestion ignoriert:
  - `eval`, `removeeval`, `changeeval`, `calcChanges` (nicht voll portiert)
- Kein vollstaendiges Multiclassing-System
- Keine vollstaendige Engine fuer alle Sonderfaelle bei Level-Ups/Features
- Spell-Slot/Prepared-Tabellen teils `table-pending`
- Mehrere Resolver arbeiten explizit mit `partial`/`pending`/Fallback-Status

Das heisst:
- **Moeglich heute:** stabiler, deterministischer Wizard mit vielen Inhalten und manueller Aufloesung offener Entscheidungen.
- **Noch nicht moeglich heute:** 100% MPMB-Automation fuer alle Edge Cases ueber 2014+2024+alle WotC-Skripte.

## 5) Was fehlt fuer "voll funktionsfaehig"?

1. Vollstaendige Ausfuehrung/Abbildung der imperativen MPMB-Regelhooks
2. Vollstaendige Spell-Progressionstabellen (slots/known/prepared) ohne Pending-Faelle
3. Vollstaendige Multiclass-Regeln inkl. Cross-Feature-Interaktionen
4. Vollstaendige Choice-Engine fuer komplexe Feature-/Feat-Unteroptionen
5. Vollstaendige Item/Spell/Feature-Interaktions-Engine (situativ/temporar)
6. Breite Regressions-Suite gegen Referenz-Charaktere (2014 und 2024)

## 6) Wichtige Einordnung

Wenn du mit "voll funktionsfaehig" den **originalen PDF-Workflow** meinst:  
MPMB im Acrobat-Kontext kann das bereits sehr weitgehend (mit passenden Add-ons und Quellenwahl).

Wenn du mit "voll funktionsfaehig" den **lokalen Web-Builder in diesem Repo** meinst:  
Der Weg ist machbar, aber es ist noch ein klarer Ausbau von MVP zu Full Rules Engine.
