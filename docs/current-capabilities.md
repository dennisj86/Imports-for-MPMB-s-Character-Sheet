# Aktueller Funktionsstand (Builder)

Stand: 2026-05-03

## Was aktuell möglich ist

- Charaktere lokal anlegen, laden, löschen, exportieren und importieren (JSON, versionierte Persistenz).
- Datenprovider getrennt wählen:
  - `provider`: `open5e | mpmb`
  - `rulesMode`: `2014 | 2024`
- Datenquellen im UI auswählen (inkl. Presets) und per **Regenerate** neu laden.
- Inhalte browsen und nutzen:
  - Classes, Subclasses, Species, Backgrounds, Feats, Spells, Equipment
- Builder-Flow:
  - Name, Level (1–20), Klasse, Subclass, Species, Background, Feats, Spells, Inventory
- Rules-Mode-Logik zentral:
  - 2024-Replacements vor 2014, Legacy-Markierung, Species/Background-Conversion
- Applied Rules Output (deterministisch):
  - angewendete Basisregeln, Granted/Required Feat-Infos, Pending Choices
- Derived Stats Output (deterministische Basiswerte):
  - Ability Modifiers
  - Proficiency Bonus
  - Saving Throws
  - Skill Modifiers
  - Passive Perception/Investigation/Insight
  - Initiative
  - Speed-Basis
  - AC-Basis
  - HP-Max-Basis
  - Spell Save DC / Spell Attack Modifier
- Level-/Progression-Layer:
  - Feature-Unlocks nach Level (Class/Subclass)
  - Subclass-Requirement am Unlock-Level
  - ASI/Feat-Opportunities als persistierbare Choices
  - Spell-Progression-Basis (Slots/Known/Prepared/Cantrips, soweit deklarativ ableitbar)
  - Pending Choices für Level-Up sichtbar
- Ingestion-Pipelines reproduzierbar:
  - Open5e
  - MPMB local
  - MPMB PDF
  - MPMB Upstream 2014/2024

## Was aktuell noch nicht möglich ist

- Keine vollständige Regelengine für alle 5e-Sonderfälle.
- Kein vollständiges Multiclassing-System.
- Keine Portierung/Ausführung von MPMB-Hooks wie `eval`, `removeeval`, `changeeval`, `calcChanges`.
- Keine vollständige automatische AC-/HP-/Save-/Skill-Berechnung mit allen situativen/temporären Modifikatoren.
- Keine vollständige Automatisierung aller Feature-Choices (nur erste strukturierte Choice-Typen im Progression-Layer).
- Keine vollständige automatische Auflösung aller Spell-Tabellen/Edge-Cases für alle Klassenvarianten.
- Keine Combat-/Action-/Condition-Engine.

## Bekannte Partial-/Pending-Bereiche

- Einige Spellcasting-Fälle bleiben `partial`/`pending`, wenn Klassen-/Tabellendaten nicht eindeutig genug sind.
- ASI/Feat-Choice ist als Entscheidung modelliert; vollständige automatische Umsetzung jeder möglichen Folgeregel ist noch nicht komplett.
- Komplexe Item-/Feature-Interaktionen (kombinierte Sonderregeln) sind weiterhin nächste Phase.
