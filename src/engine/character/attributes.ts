/**
 * The six core attributes (GAME_DESIGN.md §3).
 *
 * Product rule (decided 2026-11-13): every attribute starts at 1 and rises only when the player
 * demonstrates real-world knowledge in a competency mapped to that attribute. Race, class and
 * background never change scores. The growth formula arrives in Phase 2–3.
 */
export const attributeIds = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AttributeId = (typeof attributeIds)[number];

export type AttributeScores = Readonly<Record<AttributeId, number>>;

export interface CharacterRulesConfig {
  /** Score every attribute starts at. */
  readonly startingAttributeScore: number;
  /** Upper bound for a score. TUNABLE placeholder until the growth formula is approved. */
  readonly maxAttributeScore: number;
  readonly nameMinLength: number;
  readonly nameMaxLength: number;
  /** Max length of each free-text personality / appearance field. */
  readonly freeTextMaxLength: number;
}

export const defaultCharacterRules: CharacterRulesConfig = {
  startingAttributeScore: 1,
  maxAttributeScore: 20,
  nameMinLength: 2,
  nameMaxLength: 40,
  freeTextMaxLength: 500,
};

export function startingAttributes(rules: CharacterRulesConfig = defaultCharacterRules): AttributeScores {
  return {
    str: rules.startingAttributeScore,
    dex: rules.startingAttributeScore,
    con: rules.startingAttributeScore,
    int: rules.startingAttributeScore,
    wis: rules.startingAttributeScore,
    cha: rules.startingAttributeScore,
  };
}

/** True while a score has never risen above its starting value (no knowledge demonstrated yet). */
export function isUntested(score: number, rules: CharacterRulesConfig = defaultCharacterRules): boolean {
  return score <= rules.startingAttributeScore;
}
