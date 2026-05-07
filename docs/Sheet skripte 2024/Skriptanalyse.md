# Analyse der Sheet-Skripte (MPMB, 5.5e/2024)

## Kurzfazit
Die Skripte in `docs/Sheet skripte` sind die komplette **Dokument-JavaScript-Logik** hinter dem PDF-Sheet (Charakter erstellen, automatisiert fortschreiben, leveln, Spell Sheets erzeugen, Seiten verwalten, Import/Add-ons).  
Was **nicht** enthalten ist: das eigentliche PDF-Formular-Layout/AcroForm selbst.

## 1) Was die Skripte können

### Charakteranlage, Level-Up, Fortschritt
- Klassen/Subklassen erkennen und anwenden (inkl. Level-Verteilung, Multiclassing-Dialog).
- Species, Background, Feats, Features automatisiert zuweisen.
- Level-abhängige Features anwenden/entfernen.
- Ability-Score-Dialog mit Quellenaufschlüsselung (Basis, Klasse, Feats, Magie, Maxima, Overrides).

### Kampfrelevante Automationen
- AC/HP/Initiative/Saves/Skills berechnen.
- Waffen/Angriffe/Ammunition automatisiert parsen und berechnen.
- Proficiencies, Resistances, Vision, Languages/Tools verwalten.
- Encumbrance/Gewicht (inkl. Regelvarianten) berechnen.

### Zauber- und Spell-Sheet-Logik
- Spells parsen, zu Castern zuordnen, modifizieren, sortieren.
- Spell Sheets generieren/löschen, Prepared/Slots/Spell-Points steuern.
- Caster-spezifische Anpassungen (Ability, Overrides, Add-ons, Upcasting-Regeln etc.).

### Companion/Wildshape/Seitenverwaltung
- Companion- und Wildshape-Seiten automatisiert befüllen.
- Companion-Type-Templates, Creature-Übernahme, Level-Skalierung.
- Seiten ein-/ausblenden, Templates hinzufügen/entfernen, Bookmarks aktualisieren.

### Quellen- und Add-on-System
- Source-Dialog (inkl./exkl. Quellen und Einzelressourcen).
- Import von Add-on-Skripten (Datei oder manuell), Versionchecks für Skripte.
- Direkter Import aus anderem MPMB-PDF (inkl. Layout/Settings/Felder, mit Kompatibilitätsprüfungen).

## 2) Was enthalten ist

### Umfang
- `_functions`: **14 Dateien**, ca. **42.355 Zeilen**
- `_variables`: **14 Dateien**, ca. **28.588 Zeilen**
- `additional content`: **95 JS-Dateien** (Beispiel-/Community-Inhalte)
- `additional content syntax`: **24 JS-Dateien** (Syntaxvorlagen)
- Gesamt im Ordner: **148 Dateien** (davon **147 JS** + `README.md`)

## Kernmodule (Auszug)
- `_functions/Functions0.js`: Basis-Helfer (Feldzugriff, Formatierung, Utilitys, Fehlerbehandlung).
- `_functions/Functions1.js`: zentrale Character-Sheet-Automation + Toolbar/Buttons.
- `_functions/Functions2.js`: Companion/Wildshape/Pages/HP/Actions/Bookmarks/Import-Helfer.
- `_functions/Functions3.js`: Feature-Engine (gemeinsame Attributlogik, Add/Remove-Effekte).
- `_functions/FunctionsSpells.js`: komplette Zauber-Engine inkl. Spell-Sheet-Erzeugung.
- `_functions/FunctionsImport.js`: Add-on-Import, Direktimport, XFDF-Altpfade.
- `_functions/FunctionsResources.js`: Quellen-/Ressourcen-Dialog und Exclusion-Logik.
- `_functions/AbilityScores.js`: aktueller Ability-Score-Dialog.
- `_functions/ClassSelection.js`: Klassen-/Subclass-Leveling-Dialog.

## Enthaltene Basisdaten (out-of-the-box)
- Klassen: **12**  
- Subklassen: **12**  
- Species: **9** + Varianten/Subspecies: **22**  
- Backgrounds: **4** + Background Features: **4**  
- Feats: **16**  
- Spells: **366**  
- Kreaturen: **101**  
- Magic Items: **239**  
- Companion-Templates: **4**  
- Quellen in `Base_SourceList`: **2** (`SRD24`, `HB`)
- Psionics-Basisliste: **0** Einträge (leer)

## Add-on-Inhalte
- `additional content` enthält viele Beispielskripte (u. a. Klassen, Subklassen, Rassen, Gear, Spells, Compendia).
- `additional content syntax` enthält Vorlagen für praktisch alle Listentypen (`ClassList`, `RaceList`, `SpellsList`, `MagicItemsList`, `WeaponMasteriesList` etc.).

## 3) Was fehlt / Grenzen

1. **Kein PDF-Build aus dem Repo**  
   Die JS-Logik ist da, aber nicht das rekonstruierbare AcroForm-PDF.

2. **Rechtlich nur SRD-Basis integriert**  
   Out-of-the-box sind nur `SRD24` + `HB` als Quellenbasis eingetragen; weitere Inhalte müssen per Add-on-Skripten ergänzt werden.

3. **Psionics-Inhalte fehlen in der Basis**  
   `Base_PsionicsList` ist leer.

4. **Alte Import/Export-Pfade sind deprecated**  
   XFDF/FDF-Import wird selbst als nicht mehr voll unterstützt/teilweise Import markiert.

5. **Feature-Abhängigkeit von Acrobat**  
   Mehrere Funktionen sind an Adobe Acrobat DC+ gebunden; bei alten/inkompatiblen Versionen sind Features eingeschränkt.

6. **Direktimport mit Grenzen**  
   User-defined Icon-Import ist eingeschränkt (Reader-Limits) bzw. benötigt zusätzliche Folder-JavaScript-Installation.

7. **Legacy-/Altlasten vorhanden**
`AbilityScores_old.js` ist noch vorhanden (Legacy); viele `pre-v13`-Beispiele liegen weiter im Repo; eine Syntaxdatei ist explizit unfertig: `class (ClassList)_unfinished.js`.

8. **Kein Test- oder Typing-Setup in diesem Ordner**
Es gibt keine automatisierten Tests für diese Acrobat-Skripte und keine statische Typisierung; der Ansatz ist stark `eval`-/runtime-getrieben.

## 4) Gesamtbewertung
Für das Ziel „Charakter im PDF erstellen, verwalten, leveln und mit Homebrew erweitern“ ist die Skriptbasis sehr umfangreich und funktional.  
Die größten Lücken sind nicht Kernlogik, sondern: fehlendes rekonstruierbares PDF-Formular, SRD-only-Basisdaten, Psionics-Leerstand, Legacy-Importpfade und Acrobat-Abhängigkeiten.
