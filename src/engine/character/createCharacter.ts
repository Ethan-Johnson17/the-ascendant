import { defaultCharacterRules, startingAttributes, type AttributeScores, type CharacterRulesConfig } from './attributes.ts';

/**
 * Character creation rules. Pure: ids and timestamps are passed in so results are reproducible.
 *
 * The engine does not import content; the caller passes the catalogue of valid ids, so new races,
 * classes or backgrounds can be added as content without touching this code.
 */

export interface CharacterCatalog {
  readonly raceIds: readonly string[];
  readonly classIds: readonly string[];
  readonly backgroundIds: readonly string[];
  readonly tinctureIds: readonly string[];
}

export interface CharacterDraft {
  name: string;
  raceId: string;
  classId: string;
  backgroundId: string;
  appearance: { tinctureId: string; description: string };
  personality: { ideals: string; bonds: string; motivation: string };
}

export interface Character {
  readonly id: string;
  readonly name: string;
  readonly raceId: string;
  readonly classId: string;
  readonly backgroundId: string;
  readonly appearance: { readonly tinctureId: string; readonly description: string };
  readonly personality: { readonly ideals: string; readonly bonds: string; readonly motivation: string };
  /** Cache of engine-derived scores. Never edited by the player. */
  readonly attributes: AttributeScores;
  /** Cache of the XP ledger total (the ledger itself arrives in Phase 2). */
  readonly totalXp: number;
  readonly createdAt: string;
}

export type DraftField = 'name' | 'raceId' | 'classId' | 'backgroundId' | 'appearance' | 'personality';
export interface DraftIssue {
  readonly field: DraftField;
  readonly message: string;
}

export function validateDraft(
  draft: CharacterDraft,
  catalog: CharacterCatalog,
  rules: CharacterRulesConfig = defaultCharacterRules,
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const name = normaliseName(draft.name);
  if (name.length < rules.nameMinLength || name.length > rules.nameMaxLength) {
    issues.push({ field: 'name', message: `Name must be ${rules.nameMinLength}–${rules.nameMaxLength} characters.` });
  }
  if (!catalog.raceIds.includes(draft.raceId)) issues.push({ field: 'raceId', message: 'Choose a race.' });
  if (!catalog.classIds.includes(draft.classId)) issues.push({ field: 'classId', message: 'Choose a class.' });
  if (!catalog.backgroundIds.includes(draft.backgroundId)) {
    issues.push({ field: 'backgroundId', message: 'Choose a background.' });
  }
  if (!catalog.tinctureIds.includes(draft.appearance.tinctureId)) {
    issues.push({ field: 'appearance', message: 'Choose a crest colour.' });
  }
  if (draft.appearance.description.trim().length > rules.freeTextMaxLength) {
    issues.push({ field: 'appearance', message: `Keep the description under ${rules.freeTextMaxLength} characters.` });
  }
  const p = draft.personality;
  if ([p.ideals, p.bonds, p.motivation].some((t) => t.trim().length > rules.freeTextMaxLength)) {
    issues.push({ field: 'personality', message: `Keep each answer under ${rules.freeTextMaxLength} characters.` });
  }
  return issues;
}

export type CreateResult = { ok: true; character: Character } | { ok: false; issues: DraftIssue[] };

/**
 * Creates a character. Every attribute starts at the configured starting score regardless of
 * race, class or background (GAME_DESIGN.md §3, decided 2026-11-13). XP starts at 0.
 */
export function createCharacter(
  draft: CharacterDraft,
  ctx: { id: string; now: Date; catalog: CharacterCatalog; rules?: CharacterRulesConfig },
): CreateResult {
  const rules = ctx.rules ?? defaultCharacterRules;
  const issues = validateDraft(draft, ctx.catalog, rules);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    character: {
      id: ctx.id,
      name: normaliseName(draft.name),
      raceId: draft.raceId,
      classId: draft.classId,
      backgroundId: draft.backgroundId,
      appearance: { tinctureId: draft.appearance.tinctureId, description: draft.appearance.description.trim() },
      personality: {
        ideals: draft.personality.ideals.trim(),
        bonds: draft.personality.bonds.trim(),
        motivation: draft.personality.motivation.trim(),
      },
      attributes: startingAttributes(rules),
      totalXp: 0,
      createdAt: ctx.now.toISOString(),
    },
  };
}

/** Trims and collapses internal whitespace. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
