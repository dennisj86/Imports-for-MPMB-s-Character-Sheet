# Builder Wizard Plan (creationX Mapping)

## 1. Referenzbilder und Mapping

Gefundene Dateien in `docs/ui images/`:

- `creation1.png`
- `creation2.png`, `creation2b.png`, `creation2c.png`
- `creation3.png`, `creation4.png`
- `creation5.png`, `creation6.png`
- `creation7.png`, `creation7_alternative.png`, `creation7_manual.png`, `creation7_pointbuy.png`, `creation7_roll.png`
- `creation8.png`
- `creation9_featselect.png`, `creation9_afterselect.png`
- `creation10.png`
- `creation11.png`, `creation11_selection.png`, `creation11_selectionb.png`, `creation11_afterselect.png`
- `creation12.png`
- `creation13a.png`, `creation13b.png`

## 2. Abgeleitete Step-Reihenfolge (Wizard)

1. **Class**  
   Referenz: `creation1*`, `creation2*`  
   Subviews:
   - Class-Katalog + Detailbeschreibung
   - gewählte Klasse inkl. pending class choices/proficiencies/feature choices

2. **Species**  
   Referenz: `creation3*`, `creation4*`  
   Subviews:
   - Species-Katalog
   - gewählte Species mit Feature-/Choice-Liste

3. **Background**  
   Referenz: `creation5*`, `creation6*`  
   Subviews:
   - Background-Katalog
   - gewählter Background mit Feature-/Choice-Liste

4. **Ability Scores**  
   Referenz: `creation7*`  
   Subviews:
   - Methoden-Tabs (Standard/Point Buy/Roll/Manual)
   - Origin-ASI-Override-Block

5. **Feats**  
   Referenz: `creation8*`, `creation9*`  
   Subviews:
   - pending feat choice cards
   - feat selection modal/list (nur zulässige Feats)
   - selected feat details

6. **Skills**  
   Referenz: `creation10*`  
   Subviews:
   - pending skill/tool choices
   - resultierende Skills/Proficiencies

7. **Spells**  
   Referenz: `creation11*`  
   Subviews:
   - pending spell choice cards (cantrip/spell buckets)
   - spell selection modal/list (nur zulässige Spells)
   - selected spell groups + slot/context summary

8. **Equipment**  
   Referenz: `creation12*`  
   Subviews:
   - starting equipment choices
   - inventory list

9. **About + Review**  
   Referenz: `creation13a*`, `creation13b*`  
   Subviews:
   - about/personal fields
   - review/completion summary inkl. offene pending choices

## 3. Feld-Mapping aus aktuellem Projekt

- **Step 1 (Class)**: Name, Provider, Rules Mode, Level, Class, Subclass
- **Step 2 (Species)**: Species-Auswahl, Conversion-Hinweise, Species-Traits
- **Step 3 (Background)**: Background-Auswahl, Conversion-Hinweise, Origin-Feat-Anforderung, Background-Benefits
- **Step 4 (Ability Scores)**: Ability-Scores + ASI/Origin-Override Hinweise
- **Step 5 (Feats)**: nur aktive feat-choices + selektierte Feats
- **Step 6 (Skills)**: class/background/species skill/tool pending choices + abgeleitete Skill-Totals
- **Step 7 (Spells)**: nur aktive spell choices / legal pool + selektierte Spells
- **Step 8 (Equipment)**: Inventory/Starting-Equipment
- **Step 9 (About + Review)**: Abschlusskontrolle, offene Fehler/Pending, Completion-Status

## 4. Dynamische Sichtbarkeit

- **Subclass-Bereich** nur wenn Klasse gewählt und Subclass verfügbar/erforderlich.
- **Feats-Step** nur wenn feat-relevante Auswahl aktiv ist oder Feats bereits gewählt sind.
- **Spells-Step** nur wenn Spellcasting vorhanden oder spell-relevante Auswahl aktiv ist.
- **Skills-Step** bleibt sichtbar, zeigt aber nur relevante pending/proficiency Blöcke.

## 5. Completion-/Pending-Logik

- Jeder Step erhält:
  - `current | completed | blocked | pending`
  - zentrale Validierung (kein JSX-Regelwissen)
- Review zeigt:
  - fehlende Pflichtdaten
  - offene pending choices
  - Schrittzuordnung zur Behebung

## 6. Feat-/Spell-Eligibility

- **Feats**:
  - Auswahl nur aus für den jeweiligen Choice-Kontext legalen Feats
  - Kontexttypen: origin/background feat, ASI-feat
  - bereits gewählte Feats werden dedupliziert
  - unsichere Prerequisite-Fälle werden konservativ ausgeschlossen und als partial dokumentiert

- **Spells**:
  - Auswahl nur aus legalem Spell-Pool pro Kontext (class/subclass/feat)
  - cantrip vs leveled spell getrennt
  - max. Spell-Level nach aktuellem Progression-Kontext
  - unsichere Fälle als pending/partial markiert statt freigegeben

## 7. Bewusste Abweichungen zur Bildvorlage

1. **Step 1 enthält zusätzlich Provider/RulesMode/Name**  
   Begründung: Diese Felder sind im Projekt technisch Pflichtkontext und müssen früh gesetzt sein, damit Resolver korrekt arbeiten.

2. **Step 4 Methoden-Tabs sind strukturell vorhanden, aber teilweise eingeschränkt**  
   Aktuelle Kernlogik ist bereits stabil für manuelle Score-Eingabe; Standard/PointBuy/Roll werden als UI-Struktur vorbereitet, wo die zugrundeliegende Engine noch nicht vollständig ist.

3. **Step 9 enthält expliziten Review-Bereich**  
   In den Bildern ist „Review Character“ als globales Ziel sichtbar; im Projekt wird dies im finalen Step zusätzlich klar materialisiert.

## 8. Offene Punkte / Lösungsvorschläge

- **Komplexe Feat-Subchoices (z. B. Magic Initiate Detail-Entscheidungen)**: als separate pending choice IDs modellieren und in nächster Phase stärker strukturieren.
- **Vollständige Spell-Choice-Feingranularität pro Feature**: schrittweise Ausbau über zusätzliche declarative mapping tables.
- **About-Felder im Draft-Modell**: optionales `profile`-Objekt als additive Migration v3 in separater Phase, um diese Felder persistent zu speichern.
