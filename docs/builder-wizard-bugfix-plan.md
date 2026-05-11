# Builder Wizard Bugfix Plan

## Scope
Dieses Dokument beschreibt die gezielten Korrekturen fuer die aktuellen Wizard-Funktionsfehler anhand von:

- `docs/builder-wizard-plan.md`
- Bug-Referenzbilder in `docs/creation bugs/`
- bestehender Resolver-Kette (Applied Rules, Derived Stats, Progression, Wizard Eligibility)

## Bug-Inventar

### 1) Background-Step bleibt faelschlich `pending`
- **Symptom**: Nach gueltiger Background-Auswahl bleibt der Step wegen Origin-Feat-Warnung auf `pending`.
- **Betroffene Stellen**:
  - `src/services/data/builderWizardResolver.ts` (`validateBuilderStep`)
  - `src/pages/CharacterBuilderPage.tsx` (`BackgroundStep`)
- **Vermutete Ursache**:
  - Background-Completion wird direkt an Folgeentscheidungen (Feat-Step) gekoppelt.
- **Fix**:
  - Background-Step nur fuer Background-Auswahl selbst validieren.
  - Folgeentscheidung Origin-Feat bleibt im Feat-Step als echte Pflicht.
  - Background-Step zeigt Benefits + Conversion-Infos sichtbar an (skills/tools/languages/features/granted/required feat).

### 2) Species-/Skill-Uebernahme unvollstaendig
- **Symptom**: Species-Skill-Proficiencies/Skill-Choices erscheinen nicht konsistent im Skills-Step.
- **Betroffene Stellen**:
  - `src/services/data/appliedRulesResolver.ts` (proficiency aggregation)
  - `src/services/data/builderWizardResolver.ts` (Skill choice state)
  - `src/pages/CharacterBuilderPage.tsx` (`SkillsStep`)
- **Vermutete Ursache**:
  - Skill-Choice-Modell ist aktuell nur auf Klassen-Skillchoices ausgelegt.
- **Fix**:
  - Generalisiertes Skill-Choice-State (class/species/background) im Resolver.
  - Species-Skillchoices (z. B. Half-Elf) als strukturierte Pending-Choices modellieren und UI-seitig auswaehlbar machen.
  - Konsolidierte Proficiency-Uebernahme in Applied Rules/Derived Stats.

### 3) Ability-Scores: ASI-Modus und transparente Anzeige fehlen
- **Symptom**: 2024-Background-ASI vs Species-ASI nicht als explizite Wahl sichtbar; Base/Bonus/Final nicht transparent.
- **Betroffene Stellen**:
  - `src/services/data/appliedRulesResolver.ts`
  - `src/pages/CharacterBuilderPage.tsx` (`AbilitiesStep`)
- **Vermutete Ursache**:
  - Derzeit implizite ASI-Anwendung ohne expliziten Origin-ASI-Modus.
- **Fix**:
  - Zentrale Origin-ASI-Mode-Choice in `featureChoices` (z. B. `ability-choice:origin-mode`).
  - Resolver wendet ASI je Modus deterministisch an (inkl. Notes/ignored markers).
  - Ability-Step zeigt je Attribut: Base, Applied Bonus, Final.

### 4) Feat-Subchoices nicht strukturiert (Magic Initiate)
- **Symptom**: Feat auswaehlbar, aber notwendige Unterentscheidungen bleiben nur implizit/Text.
- **Betroffene Stellen**:
  - `src/services/data/builderWizardResolver.ts` (feat eligibility)
  - `src/features/character-builder/wizard/components/FeatChoiceSection.tsx`
- **Vermutete Ursache**:
  - Feat-Context kennt aktuell nur Primerauswahl, keine Subchoice-Struktur.
- **Fix**:
  - Strukturierte Feat-Subchoices am Context (z. B. Spell list, casting ability).
  - UI fuer Subchoices im Feat-Step.
  - Magic-Initiate-Subchoices in `featureChoices` persistieren und fuer Spell-Eligibility verwenden.

### 5) Spell-Step zeigt fuer Paladin 2024 L1 keine legalen Optionen
- **Symptom**: Spell-Step leer/blocked trotz erwarteter Spell-Choice-Kontexte.
- **Betroffene Stellen**:
  - `src/services/data/progressionResolver.ts` (slot/progression basis)
  - `src/services/data/builderWizardResolver.ts` (spell contexts)
- **Vermutete Ursache**:
  - Halb-Caster-Tabelle behandelt L1-Spellcasting-Start nur als partial note ohne Level-1-Slots/-Pool.
- **Fix**:
  - Deterministische 2024-L1-Halb-Caster-Basis fuer Spell-Context-Freigabe.
  - Fallback fuer prepared-pool context (mindestens legaler L1-Pool wenn laut Progression verfuegbar).
  - Step-Pending/Completion an echte offenen Spell-Choices koppeln.

### 6) Equipment-Step schreibt Startausruestung/GP nicht in State
- **Symptom**: Step bleibt manueller Katalog ohne character-creation-Logik fuer Starting Gear.
- **Betroffene Stellen**:
  - `src/services/data/builderWizardResolver.ts` (neuer starting-gear resolver)
  - `src/pages/CharacterBuilderPage.tsx` (`EquipmentStep`)
  - ggf. `src/domain/builderWizard.ts` (choice types)
- **Vermutete Ursache**:
  - Kein strukturiertes Choice-Modell fuer class/background-starting-equipment.
- **Fix**:
  - Starting-Equipment-Choice-State (source + option + item payload) einfuehren.
  - Background-/Class-Equipment (soweit deterministisch parsebar) als auswaehlbare Pakete/Optionen anzeigen.
  - GP-Alternativen als State-Eintrag materialisieren (z. B. Inventory currency item), nicht nur als Hinweis.

## Geplanter Implementierungspfad

1. Resolver-/Domain-Erweiterungen fuer:
   - Skill choice states
   - ASI origin mode
   - Feat subchoices
   - Spell context fallback
   - Starting equipment choices
2. Wizard-Step-UI an Resolver anbinden (keine JSX-Regellogik).
3. Completion-Logik pro Step korrigieren (kein ewiges pending ohne echte offene Pflicht).
4. Tests fuer Background, ASI/Skills, Feat subchoices, Spells (Paladin 2024 L1), Equipment/GP.
5. Doku-Update (`builder-wizard-plan.md`, ggf. `README.md`).

## Offene Unsicherheiten

- **MPMB-Upstream Core** enthaelt fuer einige Klassen keine expliziten Starting-Equipment-Choice-Strukturen im normalisierten Modell.
  - Loesung: deterministische Parse-Fallbacks nutzen; unsichere Bereiche als `partial` markieren statt implizit raten.
- **Magic Initiate Varianten** unterscheiden sich nach Quelle.
  - Loesung: Liste + Casting-Ability als Subchoices modellieren, mit klaren Defaults/Notes bei unvollstaendiger Datenlage.
