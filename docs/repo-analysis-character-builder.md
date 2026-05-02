# Repository Analysis for D&D Character Builder

## 1. Executive Summary
- **Kurzfassung**: Diese Repository ist primär eine Sammlung von ausführbaren MPMB-Importskripten (`.js`) für D&D 5e-Inhalte, nicht eine modulare App-Codebase. Die Daten liegen als globale Objekt-Mutationen vor (`RaceList`, `SpellsList`, `MagicItemsList`, `AddSubClass`, etc.).
- **Gut nutzbar**:
  - Sehr große Menge an Content-Daten (Spells, Species/Races, Feats, Backgrounds, Items, Subclasses).
  - Viele regelnahe Metadaten sind bereits enthalten (`minlevel`, `usages`, `recovery`, `spellcastingFactor`, `spellcastingKnown`, `prereqeval`).
  - Build-Pipeline für aggregierte 2014/UA-Imports existiert (`gulpfile.js`).
- **Problematisch**:
  - Kein entkoppeltes Domänenmodell/API; Daten und Logik hängen am MPMB-PDF-Runtime-Umfeld (globale Variablen/Funktionen wie `What`, `How`, `CurrentSpells`, `AddFeatureChoice`, `SetStringifieds`).
  - Kaum vollständige Klassenbasis in dieser Repo (viele Dateien liefern Subclasses/Optionen, nicht die gesamten Core-Klassen).
  - Keine Tests, keine Schema-Validierung, keine CI-Minify-Ausführung.
  - 2024-Dateien sind nicht in die aktuelle Build/Release-Aggregation eingebunden.

## 2. Project Structure
### Gesichert gefunden
- `package.json`
  - Skripte: `minify`, `minifyStable`, `minifyBeta`
  - Dev-Dependencies: `gulp`, `gulp-concat`, `gulp-uglify`, `gulp-replace`, `gulp-header`, `gulp-rename`, `fancy-log`
- `gulpfile.js`
  - Zentrale Build-/Transformationslogik
  - Aggregiert `pub_*.js` und `ua_*.js` in:
    - `WotC material/all_WotC_published(.min).js`
    - `WotC material/all_WotC_unearthed_arcana(.min).js`
    - `WotC material/all_WotC_pub+UA(.min).js`
- `.github/workflows/main.yml`
  - Release-Job lädt bestehende `WotC material/all_WotC_*.js` Artefakte hoch
  - `npm install`/`npm run minify` sind auskommentiert
- Inhaltsverzeichnisse:
  - `WotC material/` (135 JS-Dateien; größte Datensammlung, inkl. aggregierter Dateien)
  - `WotC 2024/` (4 JS-Dateien; 2024-Regelset/Legacy-Backport-Snippets)
  - `Homebrew/` (1 JS-Datei)

### Wahrscheinlich
- Primärer praktischer Entry-Point für Nutzer ist ein fertiges `all_WotC_*.js` (siehe README).
- Einzelne `pub_*`/`ua_*` Dateien werden zusätzlich manuell importiert, wenn selektiver Content gewünscht ist.

### Unklar
- Ob Releases immer aus frischem Minify-Lauf entstehen (Workflow baut aktuell nicht selbst).

## 3. Existing Data Sources
Hinweis: Format ist fast durchgängig **ausführbares JS**, keine statischen JSON-Dumps.

### Klassen
- **Fundorte**:
  - `WotC material/pub_20201117_TCoE.js` (`ClassList.artificer`)
  - `WotC material/pub_20191119_ERftLW.js` (`ClassList.artificer`)
  - `WotC material/pub_20190903_DnDEK_dupl.js` (Sidekick-Klassen)
  - `WotC material/pub_20201117-2_TCoE-sidekicks.js` (Sidekick-Klassen)
  - `WotC material/ua_20170313_The-Mystic-Class.js` (`ClassList.mystic`)
  - `WotC material/ua_20160912_The-Ranger,-Revised.js` (`ClassList.rangerua`)
  - `WotC material/ua_20150909_Ranger.js`, `ua_20151005_Prestige Classes and Rune Magic.js`, `ua_20150406_Modifying-Classes.js`
- **Format**: `ClassList.<key> = { ... }` oder `ClassList["..."] = { ... }`
- **Zugriffsmethode**: Objekt-Key als primärer Identifier
- **Wiederverwendbarkeit**: Mittel; viele Felder sind wertvoll, aber Callbacks (`eval`, `calcChanges`) sind MPMB-gebunden

### Subklassen
- **Fundorte**:
  - Sehr breit über `pub_*`, `ua_*`, `WotC 2024/*` verteilt
  - Beispiele: `WotC material/pub_20171121_XGtE.js`, `WotC 2024/pub_20240917_PHB.js`
- **Format**: `AddSubClass("<classKey>", "<subKey>", { ... })`
- **Zugriffsmethode**: Aus `AddSubClass`-Argumenten + Feature-Struktur
- **Wiederverwendbarkeit**: Hoch für Katalog/Optionen; mittel für automatische Regeln

### Spells
- **Fundorte**:
  - u. a. `WotC material/pub_20171121_XGtE.js`, `pub_20150416_EE.js`, `pub_20140818_PHB.js`, `WotC 2024/pub_20240917_PHB.js`
- **Format**: `SpellsList["spell-key"] = { ... }`
- **Zugriffsmethode**: Key + Felder (`classes`, `level`, `school`, `components`, ...)
- **Wiederverwendbarkeit**: Hoch (für Spellbrowser sehr geeignet)

### Features (Klassen-/Subklassen-/Rassen-/Feat-/Item-Features)
- **Fundorte**:
  - In `features`-Objekten innerhalb von Klassen/Subklassen/Rassen
  - `AddFeatureChoice(...)` in vielen Dateien (z. B. `pub_20201117_TCoE.js`, `pub_20181107_LLoK.js`)
- **Format**: strukturierte Objekte + häufig JS-Callbacks
- **Zugriffsmethode**: über Parent-Entität und Feature-Key (`subclassfeature3`, ...)
- **Wiederverwendbarkeit**: Mittel; beschreibende Daten gut, imperative Hooks schwer portierbar

### Species/Races
- **Fundorte**:
  - breit verteilt, z. B. `WotC material/pub_20220125_MotM.js`, `pub_20200317_EGtW.js`, `WotC 2024/pub_20240917_PHB.js`
- **Format**: `RaceList["race-key"] = { ... }`, Varianten via `AddRacialVariant(...)`
- **Zugriffsmethode**: Race-Key + Varianten-Mechanik
- **Wiederverwendbarkeit**: Hoch für Auswahl/Anzeige; mittel für automatische Regelanwendung

### Equipment (Weapons/Armor/Magic Items/Gear)
- **Fundorte**:
  - `MagicItemsList` sehr umfangreich (z. B. `pub_20201117_TCoE.js`, `pub_20171121_XGtE.js`, `pub_20141209_DMG.js`)
  - `WeaponsList`, `ArmourList`/`ArmorList`, `GearList`, `AmmoList`
- **Format**: Objektlisten mit optionalen `weaponOptions`/`armorOptions`, `modifiers`, `spellcastingBonus`, `calcChanges`
- **Zugriffsmethode**: Item-Key plus optional erzeugte Unteroptionen
- **Wiederverwendbarkeit**: Mittel bis hoch (Katalog hoch; Regelwirkung benötigt Adapter/Engine)

### Hintergründe
- **Fundorte**:
  - `WotC material/pub_20140818_PHB.js` (klassische Hintergründe)
  - `WotC 2024/pub_20240917_PHB.js` (neue 2024-Hintergründe)
  - weitere Publikationen (`SCAG`, `ERftLW`, `Planescape`, ...)
- **Format**: `BackgroundList[...]` + `BackgroundFeatureList[...]`
- **Zugriffsmethode**: Hintergrund-Key plus Feature-Key
- **Wiederverwendbarkeit**: Hoch (inkl. Skills/ToolProfs/Starter-Equipment/Feats-Verknüpfung)

### Sonstiges
- **Creature-/Companion-Daten**: `CreatureList`, `CompanionList` in mehreren Publikationen (Wildshape/Familiars/Companions)
- **Psionics-Spezialdaten**: `PsionicsList` (z. B. `ua_20170313_The-Mystic-Class.js`)
- **Source-Metadaten**: `SourceList[...]` pro Datei/Quelle

## 4. Existing Import and Transformation Logic
### Gesichert gefunden
- **Rohdaten-Laden**: Nicht über klassische Module, sondern durch direkte Ausführung der JS-Dateien im MPMB-Kontext.
- **Build-Transformation (`gulpfile.js`)**:
  - Input-Glob: `${folder}/${glob}_*.js`
  - Ausschlüsse:
    - Dateiebene: `*_dupl.js`, `*_wip.js`
    - Blockebene: Inhalte zwischen `dupl_start` / `dupl_end`
  - Entfernt/vereinheitlicht Header (`iFileName`, `RequiredSheetVersion`) und setzt neue Sammelheader.
  - Erzeugt unminified + minified Sammeldateien.
- **Release-Output**:
  - `all_WotC_published(.min).js`
  - `all_WotC_unearthed_arcana(.min).js`
  - `all_WotC_pub+UA(.min).js`

### Kritische Stellen
- `WotC 2024/` wird nicht durch die aktuelle Gulp-Pipeline aggregiert.
- Viele Querverweise/Conditionals (`if (!SourceList.X)`, `if (MagicItemsList["..."])`, `if (ClassSubList["..."])`) machen Import-Reihenfolge relevant.
- Aggregierte Dateien sind durch Duplikatfilterung nicht 1:1 Summe aller Einzeldateien.

## 5. Character-Builder-Relevant Logic
### Vorhandene Regel-/Ableitungslogik
- **Level Progression**:
  - Klassenfelder wie `improvements`, `attacks`, `features.minlevel`, teils `levels.map(...)`
  - z. B. `pub_20201117_TCoE.js`, `pub_20190903_DnDEK_dupl.js`
- **Subclass-Freischaltung**:
  - Durch `AddSubClass` + Feature-Levelschwellen
- **Spellcasting**:
  - `spellcastingFactor`, `spellcastingList`, `spellcastingKnown`, teils `spellcastingTable`
  - `spellcastingBonus`, `spellChanges`, `calcChanges.spellAdd`
- **Choice-/Option-Systeme**:
  - `choices`, `extrachoices`, `extraTimes`, `choiceDependencies`, `AddFeatureChoice`
- **Equipment-Effekte**:
  - `modifiers`, `weaponOptions`, `armorOptions`, `calcChanges`, `action`, `extraLimitedFeatures`

### Fehlende/extern gebundene Logik
- **Proficiency Bonus als zentrale Engine-Funktion**: nicht als unabhängiger Service implementiert (nur Nutzung z. B. `ProficiencyBonusList`, `How('Proficiency Bonus')`)
- **Ability Modifiers als eigene Domänenfunktion**: nicht zentral modelliert
- **HP/AC/Saves/Skills als entkoppelte Rechenengine**: stark an MPMB-Funktionen gebunden
- **Prepared/Known-Spells Engine**: teilweise Daten vorhanden, aber kein repo-eigenes, UI-unabhängiges Regelmodul
- **Persistenter Character-State + Validierung**: fehlt

### Einschätzung direkte Nutzbarkeit
- **Direkt nutzbar**: Katalogdaten (Spells, Races, Feats, Backgrounds, Items) mit moderater Normalisierung.
- **Teilweise nutzbar**: Klassen-/Subklassenlogik, wenn Adapter Callbacks ausblendet oder übersetzt.
- **Nicht direkt nutzbar**: imperative `eval/removeeval/calcChanges`-Hooks ohne MPMB-Runtime.

## 6. Proposed Adapter Layer
Nur Vorschlag, keine Implementierung:

- `getSources(): Source[]`
- `getClasses(): ClassSummary[]`
- `getClassById(id: string): ClassDefinition | null`
- `getSubclassesForClass(classId: string): SubclassDefinition[]`
- `getSpells(filters: SpellFilters): SpellDefinition[]`
- `getSpellById(id: string): SpellDefinition | null`
- `getSpecies(): SpeciesDefinition[]`
- `getBackgrounds(): BackgroundDefinition[]`
- `getFeats(filters): FeatDefinition[]`
- `getEquipmentCatalog(filters): EquipmentItem[]`
- `getFeaturesForClassLevel(classId: string, level: number, subclassId?: string): FeatureDefinition[]`
- `getCharacterOptions(context: CharacterContext): CharacterOptionSet`
- `validatePrerequisites(selection, context): ValidationResult[]`
- `computeDerivedStats(characterDraft): DerivedStats` (eigene neue Engine; nicht aus bestehenden Hooks direkt)

Adapter-Strategie:
- Nur deklarative Felder mappen.
- Imperative Callback-Felder (`eval`, `removeeval`, `calcChanges`, String-`calculate`) in separatem Kompatibilitäts-Layer kapseln oder initial ignorieren.

## 7. Proposed Domain Model
**Hinweis:** Markierung pro Abschnitt:
- `[Gesichert]` aus Repository klar ableitbar
- `[Annahme]` vorgeschlagene App-Modellierung

```ts
// [Annahme] App-Aggregat
interface Character {
  id: string;
  name: string;
  levelTotal: number;
  abilityScores: AbilityScores;
  classLevels: ClassLevel[];
  speciesId?: string;
  backgroundId?: string;
  featIds: string[];
  spellcasting: SpellcastingState[];
  featureChoices: FeatureChoice[];
  inventory: Inventory;
  equippedItems: EquippedItems;
  proficiencies: Proficiencies;
  derived: DerivedStats;
}

// [Gesichert] Strukturprinzipien aus Race/Class/Feat-Feldern ableitbar
interface AbilityScores { str: number; dex: number; con: number; int: number; wis: number; cha: number; }

// [Gesichert] Klassen-/Subklassen-Referenz nötig, [Annahme] konkrete Form
interface ClassLevel { classId: string; subclassId?: string; level: number; }

// [Gesichert] Subclass hat parent class + feature gates
interface Subclass { id: string; classId: string; name: string; features: FeatureDefinition[]; }

// [Gesichert] spellcastingFactor/known/list existieren, [Annahme] Laufzeitstate
interface SpellcastingState {
  classId: string;
  ability?: "str"|"dex"|"con"|"int"|"wis"|"cha";
  knownSpellIds: string[];
  preparedSpellIds: string[];
  slotsByLevel: Record<number, number>;
}

// [Gesichert] choices/extrachoices vorhanden
interface FeatureChoice { featureId: string; selectedOptionIds: string[]; sourceRef?: string; }

// [Gesichert] Equipment-Listen vorhanden, [Annahme] State-Form
interface Inventory { itemIds: string[]; quantities: Record<string, number>; }
interface EquippedItems { weaponIds: string[]; armorId?: string; shieldId?: string; attunedItemIds: string[]; }

// [Gesichert] prof-Felder vorhanden, [Annahme] Normalisierung
interface Proficiencies {
  saves: string[];
  skills: string[];
  tools: string[];
  languages: string[];
  armor: string[];
  weapons: string[];
}

// [Annahme] neue, UI-unabhängige Berechnungsstruktur
interface DerivedStats {
  proficiencyBonus: number;
  initiative: number;
  armorClass: number;
  hitPointsMax: number;
  speed: Record<string, number>;
  saveBonuses: Record<string, number>;
  skillBonuses: Record<string, number>;
}
```

## 8. Risks / Gaps / Open Questions
### Technische Risiken
- **Starke Runtime-Kopplung** an MPMB-Globals und PDF-spezifische APIs.
- **Inhomogene Datendefinitionen** (z. B. `scores` vs `scorestxt`; `source` als Array vs Array-von-Arrays; teils String-basiertes `calculate`).
- **Duplikat-/Reprint-Logik** über Dateinamen + Marker + Conditionals kann bei externer Nutzung zu Doppelcontent führen.
- **Release-Pipeline** baut nicht automatisch; Artefakte können veralten.
- **2024-Content nicht aggregiert** in aktuellem Build/Release-Pfad.

### Inhaltliche Lücken
- Vollständige Core-Klassenbasis ist hier nicht durchgängig enthalten (viele Optionen setzen bestehende SRD/Sheet-Daten voraus).
- Keine explizite, konsistente ID-Schicht für alle Entitäten (häufig freie String-Keys).
- Requirement-Logik teils nur als JS-Funktion oder Text vorhanden.

### Offene Fragen
- Soll spätere App nur diese Repo-Daten nutzen oder zusätzlich SRD/Core-Datenquellen?
- Welche Regel-Tiefe für MVP: nur deklarative Auswahl oder vollständige Automatisierung (inkl. Hook-Semantik)?
- Soll 2024 und 2014 parallel unterstützt werden oder getrennte Modi/Datensets?
- Wie sollen `eval/removeeval/calcChanges`-Callbacks migriert werden (ignorieren, interpreten, manuell nachbauen)?

## 9. Recommended MVP Scope
### Schnell und sauber umsetzbar
- Read-only Content-Browser für:
  - Species/Races
  - Backgrounds
  - Feats
  - Spells
  - Subclasses
  - Equipment/Magic Items
- Basis-Character-Draft:
  - Ability Scores manuell
  - Auswahl Species/Background/Feats/Spells
  - Keine vollständige Auto-Regelengine

### Explizit später
- Vollständige Regelautomatisierung (AC/HP/Saves/Skills/Slot-Engine)
- Vollständige Unterstützung aller `calcChanges`-/`eval`-Effekte
- Automatische Konfliktauflösung bei Reprints/UA/Publications
- Mischbetrieb 2014 + 2024 inkl. Konfliktstrategie

### Sinnvolle Klassen-/Spellcasting-/Level-Grenzen für MVP
- **Variante A (realistisch für frühe Interaktivität):**
  - Fokus auf Katalog + Auswahl ohne harte Regelberechnung, Level 1–5.
- **Variante B (regelorientierter, enger):**
  - Klassen mit expliziter Definition in Repo (z. B. Artificer/Sidekicks) zuerst vollständig modellieren.
- **Spellcasting MVP**:
  - zunächst nur deklarative Verknüpfung (`class list`, `known/prepared` als Auswahl),
  - Slot-/Preparation-Validierung erst in Phase 2.

---

## Priorisierte Umsetzungsreife
### Sofort nutzbar
- `SourceList`, `SpellsList`, `RaceList`, `BackgroundList`, `BackgroundFeatureList`, `FeatsList`, große Teile von `MagicItemsList`/`WeaponsList` als Katalogdaten.

### Mit Adapter nutzbar
- `AddSubClass`-Daten und Klassen-/Feature-Felder (`minlevel`, `usages`, `recovery`, `spellcasting*`, `choices`).
- Teilweise Equipment-/Feature-Effekte mit deklarativen Feldern.

### Muss neu gebaut werden
- Unabhängige Character-Engine (Proficiency Bonus, Ability-Mods, AC/HP/Saves/Skills, Spell-Slot-Logik).
- Ausführung/Portierung von `eval/removeeval/calcChanges` außerhalb des MPMB-Umfelds.
- Konsistentes ID-/Schema-/Validation-Layer für App-Use-Cases.
