import { toSlug } from "../../../lib/slug";

type ClassResolverInput = {
  key?: string | null;
  name?: string | null;
  fallback?: string | null;
};

const explicitRawKeyMap: Record<string, string> = {
  "srd-2024_barbarian": "barbarian",
  "srd-2024_bard": "bard",
  "srd-2024_cleric": "cleric",
  "srd-2024_druid": "druid",
  "srd-2024_fighter": "fighter",
  "srd-2024_monk": "monk",
  "srd-2024_paladin": "paladin",
  "srd-2024_ranger": "ranger",
  "srd-2024_rogue": "rogue",
  "srd-2024_sorcerer": "sorcerer",
  "srd-2024_warlock": "warlock",
  "srd-2024_wizard": "wizard",
  srd_barbarian: "barbarian",
  srd_bard: "bard",
  srd_cleric: "cleric",
  srd_druid: "druid",
  srd_fighter: "fighter",
  srd_monk: "monk",
  srd_paladin: "paladin",
  srd_ranger: "ranger",
  srd_rogue: "rogue",
  srd_sorcerer: "sorcerer",
  srd_warlock: "warlock",
  srd_wizard: "wizard",
  clericua: "cleric",
  fighterua: "fighter",
  rangerua: "ranger",
  rogueua: "rogue",
  sorcererua: "sorcerer",
  warlockua: "warlock",
  wizardua: "wizard",
};

const aliasMap: Record<string, string> = {
  barbarian: "barbarian",
  bard: "bard",
  cleric: "cleric",
  druid: "druid",
  fighter: "fighter",
  monk: "monk",
  paladin: "paladin",
  ranger: "ranger",
  rogue: "rogue",
  sorcerer: "sorcerer",
  warlock: "warlock",
  wizard: "wizard",
  artificer: "artificer",
  mystic: "mystic",
  "rune-scribe": "rune-scribe",
  "sidekick-expert": "sidekick-expert",
  "sidekick-spellcaster": "sidekick-spellcaster",
  "sidekick-warrior": "sidekick-warrior",
  "spellcaster-sidekick": "sidekick-spellcaster",
  "warrior-sidekick": "sidekick-warrior",
  "expert-sidekick": "sidekick-expert",
};

function normalizeCandidate(value: string): string {
  return toSlug(value)
    .replace(/^class-/, "")
    .replace(/^srd-2024-/, "")
    .replace(/^srd-/, "")
    .replace(/^open5e-/, "")
    .replace(/^a5e-/, "")
    .replace(/^ua-/, "");
}

function findAliasMatch(value: string): string | undefined {
  if (aliasMap[value]) {
    return aliasMap[value];
  }
  for (const [alias, canonical] of Object.entries(aliasMap)) {
    if (value.includes(alias)) {
      return canonical;
    }
  }
  return undefined;
}

export function resolveCanonicalClassKey(input: ClassResolverInput): string {
  const key = (input.key ?? "").trim().toLowerCase();
  if (key && explicitRawKeyMap[key]) {
    return explicitRawKeyMap[key];
  }

  const name = (input.name ?? "").trim();
  const fallback = (input.fallback ?? "").trim();
  const normalizedCandidates = [key, name, fallback]
    .map((entry) => normalizeCandidate(entry))
    .filter(Boolean);

  for (const candidate of normalizedCandidates) {
    const aliasMatch = findAliasMatch(candidate);
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  return normalizedCandidates[0] ?? "unknown-class";
}
