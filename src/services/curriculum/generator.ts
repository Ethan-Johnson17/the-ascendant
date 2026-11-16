import { z } from 'zod';
import { validateCurriculum, type CurriculumValidation } from '../../engine/learning/curriculum.ts';

/**
 * Curriculum generation for any subject (CLAUDE.md Part 7).
 *
 * A generator receives the learner's request and proposes a curriculum; nothing it returns is
 * trusted until `validateCurriculum` accepts it. Phase 4 adds an AI-backed generator behind this
 * same interface. Until then the only implementation is the clearly labelled development fixture
 * (src/fixtures/fixtureCurriculumGenerator.ts), whose output is marked `origin: 'fixture'`.
 */

export const generationRequestSchema = z.object({
  subject: z.string().trim().min(2).max(80),
  objective: z.string().trim().min(5).max(500),
  startingProficiency: z.enum(['none', 'beginner', 'intermediate', 'advanced']),
  minutesPerWeek: z.number().int().min(15).max(3000),
  depth: z.enum(['survey', 'standard', 'deep']),
  /** Competency names the learner has already shown in other campaigns. */
  priorLearning: z.array(z.string().trim().max(120)).max(50).default([]),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export interface CurriculumGenerator {
  /** Identifies the implementation, e.g. 'fixture' or 'ai:<provider>/<model>'. */
  readonly id: string;
  /** Proposes a curriculum. The result is untrusted until validated. */
  propose(request: GenerationRequest, templateId: string): Promise<unknown>;
}

export type GenerationResult = { ok: true; generator: string; validation: Extract<CurriculumValidation, { ok: true }> } | { ok: false; generator: string; issues: readonly string[] };

/** Validates the request, asks the generator, and validates what comes back. */
export async function generateCurriculum(generator: CurriculumGenerator, request: unknown, templateId: string): Promise<GenerationResult> {
  const req = generationRequestSchema.safeParse(request);
  if (!req.success) return { ok: false, generator: generator.id, issues: req.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  let proposed: unknown;
  try {
    proposed = await generator.propose(req.data, templateId);
  } catch (err) {
    return { ok: false, generator: generator.id, issues: [`Generator failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const validation = validateCurriculum(proposed);
  if (!validation.ok) return { ok: false, generator: generator.id, issues: validation.issues };
  if (validation.curriculum.templateId !== templateId) return { ok: false, generator: generator.id, issues: ['Generated curriculum is for a different campaign'] };
  return { ok: true, generator: generator.id, validation };
}
