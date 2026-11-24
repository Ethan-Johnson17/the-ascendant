/**
 * Practical projects (GAME_DESIGN.md "Practical projects", decided 2026-11-17 and 2026-11-23).
 * A project is one written task for a topic, proving Advanced. It opens when every skill it covers
 * is Proficient (the same rule as any Advanced check). For AI-made courses the Course Builder writes
 * it once, when every lesson is built and every skill the lessons teach is Proficient.
 */

export const projectOpensAt = 4; // Proficient

export type ProjectStatus =
  | { readonly kind: 'ready' }
  | { readonly kind: 'not_built' }
  | { readonly kind: 'waiting'; readonly needs: readonly string[] }
  | { readonly kind: 'written' };

/** Whether an AI-made course's project can be written now. `needs` names the skills still below Proficient. */
export function projectStatus(input: {
  readonly hasProject: boolean;
  readonly allBuilt: boolean;
  readonly competencies: readonly { readonly name: string; readonly stage: number }[];
}): ProjectStatus {
  if (input.hasProject) return { kind: 'written' };
  if (!input.allBuilt || input.competencies.length === 0) return { kind: 'not_built' };
  const needs = input.competencies.filter((c) => c.stage < projectOpensAt).map((c) => c.name);
  return needs.length ? { kind: 'waiting', needs } : { kind: 'ready' };
}
