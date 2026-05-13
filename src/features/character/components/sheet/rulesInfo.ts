const RULE_INFO_BY_KEY: Record<string, string> = {
  blinded: "You cannot see, which usually hurts attack accuracy and sight-based checks.",
  charmed: "You cannot target the charmer with harmful effects and social pressure is stronger.",
  deafened: "You cannot hear, affecting hearing-based checks and cues.",
  frightened: "You have disadvantage while the source of fear is visible and avoid moving closer.",
  grappled: "Your speed is 0 until the grapple ends.",
  incapacitated: "You cannot take actions or reactions.",
  invisible: "You are unseen without special senses; attacks against you are harder to land.",
  paralyzed: "You are incapacitated and cannot move or speak.",
  petrified: "You are transformed into a rigid form and are incapacitated.",
  poisoned: "You have disadvantage on attack rolls and ability checks.",
  prone: "You are on the ground; standing costs movement.",
  restrained: "Speed becomes 0 and attacks are harder while incoming attacks are easier.",
  stunned: "You are incapacitated, cannot move, and struggle with physical saves.",
  unconscious: "You are incapacitated, prone, and unaware of your surroundings.",
  exhaustion: "Track the current exhaustion level; penalties scale by level.",

  concentration: "Taking damage can force a save to keep this effect active.",
  ritual: "Casting as a ritual avoids spending a slot, but takes longer.",
  buff: "This spell mainly improves a creature's rolls, defense, or utility.",
  "effect-mapped": "A structured active effect can be applied automatically.",
  "no-mapped-effect": "No structured active effect is mapped yet.",

  versatile: "Can be used one-handed or two-handed with different damage dice.",
  finesse: "Use STR or DEX for attack and damage, whichever is better for your build.",
  heavy: "Harder for small creatures; best with stronger builds.",
  light: "Easy to handle and suitable for quick/off-hand use.",
  thrown: "Can be used in melee or thrown at range.",
  range: "Can attack targets at listed normal/long range bands.",
  ranged: "Optimized for distance attacks.",
  "mastery-selected": "A mastered weapon gains extra rider effects from your mastery choice.",
  "weapon-mastery": "Weapon Mastery enables weapon-specific tactical riders.",

  "until-used": "Effect is consumed the next time it applies.",
  "one-roll": "Effect applies once to a roll and is then consumed.",
  manual: "Stays active until manually removed.",
  "concentration-duration": "Lasts while concentration is maintained.",
  active: "Currently available for roll or state resolution.",
  dismissed: "Ended manually or by resolver cleanup.",
  expired: "Ended because duration conditions were met.",

  "short-rest": "Typically recovers after a short rest.",
  "long-rest": "Typically recovers after a long rest.",
  "at-will": "Reusable without tracking limited charges.",
  special: "Recovery depends on special timing or table ruling.",

  cp: "Copper pieces are low-value coins.",
  sp: "Silver pieces are mid-value coins.",
  ep: "Electrum pieces are uncommon half-gold coins.",
  gp: "Gold pieces are the default spending baseline.",
  pp: "Platinum pieces are high-value coins.",
};

function normalizeInfoKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`'".]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ruleInfo(labelOrKey: string | undefined, fallback = "Details unavailable."): string {
  const normalized = normalizeInfoKey(labelOrKey ?? "");
  if (!normalized) {
    return fallback;
  }
  return (
    RULE_INFO_BY_KEY[normalized]
    ?? RULE_INFO_BY_KEY[normalized.replace(/^condition-/, "")]
    ?? RULE_INFO_BY_KEY[normalized.replace(/-selected$/, "")]
    ?? fallback
  );
}
