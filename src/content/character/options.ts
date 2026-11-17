import type { AttributeId } from '../../engine/character/attributes.ts';

/**
 * Character options — authored content, approved by the product owner 2026-11-13
 * (GAME_DESIGN.md §3 "Race, class and background effects").
 *
 * This is game CONTENT, not engine rules. Traits and abilities are descriptions here; their
 * mechanical effects are implemented by the combat engine in Phase 5. Nothing in this file may
 * affect XP, mastery, attribute scores or subject access.
 */

export interface AttributeInfo {
  readonly id: AttributeId;
  readonly name: string;
  readonly abbreviation: string;
  /** What the attribute represents in real-world terms, independent of any one subject. */
  readonly summary: string;
}

export const attributes: readonly AttributeInfo[] = [
  { id: 'str', name: 'Strength', abbreviation: 'STR', summary: 'Strategic force: planning, positioning and decisive action.' },
  { id: 'dex', name: 'Dexterity', abbreviation: 'DEX', summary: 'Skilful execution: applying knowledge precisely and quickly.' },
  { id: 'con', name: 'Constitution', abbreviation: 'CON', summary: 'Endurance: consistency, discipline and sustained effort.' },
  { id: 'int', name: 'Intelligence', abbreviation: 'INT', summary: 'Reason: research, analysis and structured knowledge.' },
  { id: 'wis', name: 'Wisdom', abbreviation: 'WIS', summary: 'Insight: judgement, context and understanding of people.' },
  { id: 'cha', name: 'Charisma', abbreviation: 'CHA', summary: 'Presence: communication, persuasion and explanation.' },
];

export interface EncounterFeature {
  readonly name: string;
  readonly description: string;
}

export interface RaceOption {
  readonly id: string;
  readonly name: string;
  readonly lore: string;
  readonly trait: EncounterFeature;
}

export interface ClassOption {
  readonly id: string;
  readonly name: string;
  readonly lore: string;
  /** Story flavour only — no numeric effect. */
  readonly signatureAttributes: readonly [AttributeId, AttributeId];
  readonly ability: EncounterFeature;
}

export interface BackgroundOption {
  readonly id: string;
  readonly name: string;
  readonly lore: string;
  readonly startingGear: readonly string[];
  readonly storyEffect: string;
}

export const races: readonly RaceOption[] = [
  {
    id: 'human',
    name: 'Human',
    lore: 'Short-lived and restless, humans build empires within a single lifetime and learn from every road they walk.',
    trait: { name: 'Adaptable', description: 'Once per boss, swap the current question for one on a different skill this boss tests.' },
  },
  {
    id: 'elf',
    name: 'Elf',
    lore: 'Patient watchers of centuries, elves see the shape of events long before others notice them.',
    trait: { name: 'Keen Insight', description: 'Once per boss, a hint: a wrong option is crossed out, an item placed or a pair filled in.' },
  },
  {
    id: 'dwarf',
    name: 'Dwarf',
    lore: 'Keepers of deep halls and long memory, dwarves endure what would break others.',
    trait: { name: 'Stalwart', description: 'You start every boss battle with 1 extra Resolve.' },
  },
  {
    id: 'halfling',
    name: 'Halfling',
    lore: 'Quiet, quick and improbably fortunate, halflings turn small chances into great outcomes.',
    trait: { name: 'Lucky', description: 'The first wrong answer costs no Resolve, and you face a new question on the same skill.' },
  },
];

export const classes: readonly ClassOption[] = [
  {
    id: 'fighter',
    name: 'Fighter',
    lore: 'A disciplined champion who meets every challenge head-on and recovers through sheer determination.',
    signatureAttributes: ['str', 'con'],
    ability: { name: 'Second Wind', description: 'Your first correct answer after losing Resolve restores 1.' },
  },
  {
    id: 'ranger',
    name: 'Ranger',
    lore: 'A tracker and pathfinder who reads the land and the enemy before committing to battle.',
    signatureAttributes: ['dex', 'wis'],
    ability: { name: 'Scout Ahead', description: 'Once per boss, see the next round’s skill and the ideas its questions cover.' },
  },
  {
    id: 'rogue',
    name: 'Rogue',
    lore: 'A cunning opportunist who chooses the moment of every confrontation.',
    signatureAttributes: ['dex', 'cha'],
    ability: { name: 'Gambit', description: 'Once per boss, skip the current question and face it at the end.' },
  },
  {
    id: 'wizard',
    name: 'Wizard',
    lore: 'A scholar of hidden laws whose power is drawn from what they have studied and remembered.',
    signatureAttributes: ['int', 'wis'],
    ability: { name: 'Arcane Recall', description: 'Once per boss, open the Codex entry for the current question.' },
  },
  {
    id: 'cleric',
    name: 'Cleric',
    lore: 'A steadfast guide who protects companions and steadies them when they falter.',
    signatureAttributes: ['wis', 'cha'],
    ability: { name: 'Sanctuary', description: 'Your first wrong answer costs no Resolve.' },
  },
];

export const backgrounds: readonly BackgroundOption[] = [
  {
    id: 'soldier',
    name: 'Soldier',
    lore: 'You served in ranks and campaigns, and you know how wars are won and lost.',
    startingGear: ['Worn spear', 'Campaign map'],
    storyEffect: 'Opens military and strategy dialogue options.',
  },
  {
    id: 'scholar',
    name: 'Scholar',
    lore: 'You were trained among tablets and scrolls, copying the words of those who came before.',
    startingGear: ['Quill', 'Wax tablet'],
    storyEffect: 'Gives you contacts among scribes and archivists.',
  },
  {
    id: 'merchant',
    name: 'Merchant',
    lore: 'You have haggled in a hundred markets and know the true price of everything.',
    startingGear: ['Trade ledger', 'Coin purse'],
    storyEffect: 'Opens trade and caravan dialogue options.',
  },
  {
    id: 'artisan',
    name: 'Artisan',
    lore: 'Your hands have shaped clay, metal or wood, and your craft earned you a place in the guilds.',
    startingGear: ['Craft tools'],
    storyEffect: 'Gives you contacts in workshops and guilds.',
  },
  {
    id: 'explorer',
    name: 'Explorer',
    lore: 'You have crossed rivers, deserts and mountains simply to see what lay beyond them.',
    startingGear: ['Walking staff', 'Star chart'],
    storyEffect: 'Opens traveller and geography dialogue options.',
  },
];

/** Heraldic tinctures for the character's crest — the MVP's appearance choice. */
export const tinctures = [
  { id: 'or', name: 'Or', description: 'Gold', hex: '#d4b872' },
  { id: 'argent', name: 'Argent', description: 'Silver', hex: '#c9c6bf' },
  { id: 'gules', name: 'Gules', description: 'Red', hex: '#b5533f' },
  { id: 'azure', name: 'Azure', description: 'Blue', hex: '#5f7bb8' },
  { id: 'vert', name: 'Vert', description: 'Green', hex: '#6f9a6a' },
  { id: 'purpure', name: 'Purpure', description: 'Purple', hex: '#8a6aa8' },
] as const;
export type TinctureId = (typeof tinctures)[number]['id'];

export const characterCatalog = {
  raceIds: races.map((r) => r.id),
  classIds: classes.map((c) => c.id),
  backgroundIds: backgrounds.map((b) => b.id),
  tinctureIds: tinctures.map((t) => t.id) as readonly string[],
};

export function findRace(id: string): RaceOption | undefined {
  return races.find((r) => r.id === id);
}
export function findClass(id: string): ClassOption | undefined {
  return classes.find((c) => c.id === id);
}
export function findBackground(id: string): BackgroundOption | undefined {
  return backgrounds.find((b) => b.id === id);
}
export function findTincture(id: string) {
  return tinctures.find((t) => t.id === id);
}
export function attributeInfo(id: AttributeId): AttributeInfo {
  const info = attributes.find((a) => a.id === id);
  if (!info) throw new Error(`Unknown attribute ${id}`);
  return info;
}
