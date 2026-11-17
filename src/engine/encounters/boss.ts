import { defaultLearningConfig, type LearningConfig } from '../learning/config.ts';
import type { AssessmentItem } from '../learning/curriculum.ts';
import { gradeItem, type Answer } from '../learning/grading.ts';
import { applyAnswerToWeakness, type WeaknessEvent, type WeaknessState } from '../learning/weakness.ts';
import { planXpAward, type XpAwardPlan } from '../progression/xpAward.ts';
import { bossReadiness, bossRules, eligibleQuestions, focusBank, type BossBank } from './bossPlan.ts';
import { automaticEffect, baseResolve, type PowerId } from './powers.ts';

/**
 * Boss battles (GAME_DESIGN.md "Quest and boss rules"). One boss per stage gate: the Apprentice
 * boss (stage 2) unlocks the Competent checks, the Competent boss (3) the Proficient checks and the
 * Proficient boss (4) the Advanced checks.
 *
 * The engine decides everything here: when a boss opens, which questions it may use, what each
 * answer does to Resolve, who wins, the reward, and what recovery a defeat requires. The Strategist
 * (AI) may only propose the plan's story and order, which `checkBossPlan` must allow.
 */

export const bossStages = [2, 3, 4] as const;
export type BossStage = (typeof bossStages)[number];
export const bossConfig = { startingResolve: baseResolve, maxQuestionsWithLucky: bossRules.maxQuestions + 1 } as const;

/** A check for `targetStage` may be started only once the boss of the stage below is beaten. */
export function bossGateOpen(targetStage: number, wonStages: ReadonlySet<number>): boolean {
  return targetStage <= 2 || wonStages.has(targetStage - 1);
}

export interface BossCourseQuestion {
  readonly id: string;
  readonly activityId: string;
  /** The target stage of the check this question belongs to. */
  readonly activityStage: number;
  readonly conceptId: string;
  readonly concept: string;
  readonly competencyIds: readonly string[];
  readonly difficulty: number;
  readonly kind: string;
  readonly prompt: string;
}

export interface BossCourse {
  readonly competencies: readonly { readonly id: string; readonly name: string }[];
  readonly checks: readonly { readonly id: string; readonly targetStage: number; readonly competencyIds: readonly string[] }[];
  readonly questions: readonly BossCourseQuestion[];
  /** Lessons an AI-made course has planned but not built yet (0 for authored courses). */
  readonly unbuiltLessons: number;
}

export interface EncounterSummary {
  readonly id: string;
  readonly stage: number;
  readonly status: 'active' | 'won' | 'lost';
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly missedConceptIds: readonly string[];
}

export interface BossRecords {
  readonly stages: ReadonlyMap<string, number>;
  readonly encounters: readonly EncounterSummary[];
  /** Every counted, passed check attempt. */
  readonly checkPasses: readonly { readonly activityId: string; readonly at: Date }[];
}

const stageOf = (r: BossRecords, id: string) => r.stages.get(id) ?? 1;
export const wonStages = (r: BossRecords) => new Set(r.encounters.filter((e) => e.status === 'won').map((e) => e.stage));

/** The skills a stage's boss tests: those the course has a check for at that stage. */
export function testedCompetencies(course: BossCourse, stage: number) {
  return course.competencies.filter((c) => course.checks.some((ch) => ch.targetStage === stage && ch.competencyIds.includes(c.id)));
}

/** The questions a stage's boss may draw from, with the player's stages: checks up to that stage. */
export function bossBank(course: BossCourse, r: BossRecords, stage: number): { bank: BossBank; questions: BossCourseQuestion[]; competencies: { id: string; name: string; stage: number }[] } {
  const tested = testedCompetencies(course, stage).map((c) => ({ ...c, stage: stageOf(r, c.id) }));
  const ids = new Set(tested.map((c) => c.id));
  const qs = course.questions.filter((q) => q.activityStage <= stage && q.competencyIds.some((id) => ids.has(id)));
  const focus = focusBank({ competencies: tested, questions: qs.map((q) => ({ id: q.id, competencyIds: q.competencyIds.filter((id) => ids.has(id)), difficulty: q.difficulty, kind: q.kind })) });
  const keep = new Set(focus.competencies.map((c) => c.id));
  const keepQ = new Set(focus.questions.map((q) => q.id));
  return { bank: focus, questions: qs.filter((q) => keepQ.has(q.id)), competencies: tested.filter((c) => keep.has(c.id)) };
}

export interface RecoveryStep {
  readonly conceptId: string;
  readonly concept: string;
  readonly checkId: string;
  readonly done: boolean;
}
export interface Recovery {
  readonly stage: number;
  readonly encounterId: string;
  /** How many times this boss has been lost (names the recovery quest). */
  readonly losses: number;
  readonly steps: readonly RecoveryStep[];
  readonly done: boolean;
}

/**
 * After a defeat: pass again, after the defeat, a check covering each concept missed in the battle.
 * Null when the latest battle for the stage wasn't a defeat.
 */
export function recoveryFor(course: BossCourse, r: BossRecords, stage: number): Recovery | null {
  const fights = r.encounters.filter((e) => e.stage === stage).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const last = fights.at(-1);
  if (!last || last.status !== 'lost' || !last.endedAt) return null;
  const ended = last.endedAt.getTime();
  const checkStage = new Map(course.checks.map((c) => [c.id, c.targetStage] as const));
  const steps: RecoveryStep[] = [];
  for (const conceptId of [...new Set(last.missedConceptIds)]) {
    // The easiest check (up to this stage) that has a question on the concept.
    const candidates = course.questions.filter((q) => q.conceptId === conceptId && q.activityStage <= stage);
    const best = [...candidates].sort((a, b) => (checkStage.get(a.activityId) ?? 9) - (checkStage.get(b.activityId) ?? 9))[0];
    if (!best) continue;
    if (steps.some((s) => s.checkId === best.activityId)) continue;
    const done = r.checkPasses.some((p) => p.activityId === best.activityId && p.at.getTime() > ended);
    steps.push({ conceptId, concept: best.concept, checkId: best.activityId, done });
  }
  return { stage, encounterId: last.id, losses: fights.filter((f) => f.status === 'lost').length, steps, done: steps.every((s) => s.done) };
}

export type BossStatus =
  | { readonly kind: 'won' }
  | { readonly kind: 'active'; readonly encounterId: string }
  | { readonly kind: 'ready' }
  | { readonly kind: 'recover'; readonly recovery: Recovery }
  | { readonly kind: 'locked'; readonly reason: string }
  | { readonly kind: 'unavailable' };

const stageName: Record<number, string> = { 1: 'Novice', 2: 'Apprentice', 3: 'Competent', 4: 'Proficient', 5: 'Advanced' };

export function bossStatus(course: BossCourse, r: BossRecords, stage: number): BossStatus {
  const won = wonStages(r);
  if (won.has(stage)) return { kind: 'won' };
  const active = r.encounters.find((e) => e.stage === stage && e.status === 'active');
  if (active) return { kind: 'active', encounterId: active.id };
  const tested = testedCompetencies(course, stage);
  if (tested.length === 0) return { kind: 'unavailable' };
  if (stage > 2 && !won.has(stage - 1)) return { kind: 'locked', reason: `Beat the ${stageName[stage - 1]} boss first.` };
  if (course.unbuiltLessons > 0) return { kind: 'locked', reason: `Build every lesson in this course first (${course.unbuiltLessons} still to build).` };
  const behind = tested.filter((c) => stageOf(r, c.id) < stage);
  if (behind.length > 0) return { kind: 'locked', reason: `Bring every skill to ${stageName[stage]}: ${behind.map((c) => c.name).join(', ')} ${behind.length === 1 ? 'is' : 'are'} not there yet.` };
  const recovery = recoveryFor(course, r, stage);
  if (recovery && !recovery.done) return { kind: 'recover', recovery };
  if (!bossReadiness(bossBank(course, r, stage).bank).ready) return { kind: 'locked', reason: 'This course doesn’t have enough checked questions for this boss yet.' };
  return { kind: 'ready' };
}

/** A plain plan the game makes itself when the Strategist (AI) isn't available. Follows the rules. */
export function gameBossPlan(stage: number, bank: BossBank, names: ReadonlyMap<string, string>) {
  const used = new Set<string>();
  const rounds: { competencyId: string; competencyName: string; title: string; narration: string | null; questionIds: string[] }[] = [];
  const take = (competencyId: string, count: number) => {
    const qs = eligibleQuestions(bank, competencyId).filter((q) => !used.has(q.id)).slice(0, count);
    if (qs.length === 0) return false;
    qs.forEach((q) => used.add(q.id));
    rounds.push({ competencyId, competencyName: names.get(competencyId) ?? competencyId, title: names.get(competencyId) ?? 'Round', narration: null, questionIds: qs.map((q) => q.id) });
    return true;
  };
  for (const c of bank.competencies) take(c.id, 2);
  for (let i = 0; rounds.length < bossRules.minRounds && i < bank.competencies.length * bossRules.maxRounds; i++) take(bank.competencies[i % bank.competencies.length]!.id, 1);
  return {
    name: `The ${stageName[stage]} Trial`,
    epithet: 'A test set by the game itself',
    intro: [`Every skill you have brought to ${stageName[stage]} is tested here. Answer well: each mistake costs Resolve.`],
    rounds,
    victory: `You have passed the ${stageName[stage]} Trial.`,
    defeat: 'The trial is not passed this time. Recover, and return stronger.',
    removed: 0,
  };
}

export const bossQuestionIds = (plan: { rounds: readonly { questionIds: readonly string[] }[] }) => plan.rounds.flatMap((r) => r.questionIds);

export interface EncounterState {
  readonly id: string;
  readonly campaignId: string;
  readonly stage: number;
  readonly status: 'active' | 'won' | 'lost';
  readonly resolve: number;
  readonly maxResolve: number;
  readonly position: number;
  readonly questionIds: readonly string[];
  /** The player's race trait and class ability, and those already used in this battle. */
  readonly powers: readonly PowerId[];
  readonly powersUsed: readonly PowerId[];
}

export interface BossAnswerOutcome {
  readonly correct: boolean;
  readonly resolve: number;
  readonly position: number;
  readonly status: 'active' | 'won' | 'lost';
  readonly conceptId: string;
  readonly weakness: { readonly state: WeaknessState; readonly event: WeaknessEvent } | null;
  readonly xp: XpAwardPlan | null;
  /** The automatic power that acted on this answer, if any. */
  readonly power: 'sanctuary' | 'lucky' | 'second_wind' | null;
  /** The battle's questions after this answer (Lucky adds one right after this one). */
  readonly questionIds: readonly string[];
}

export type BossRefusal = { ok: false; code: 'not_active' | 'wrong_question' | 'campaign_inactive'; message: string };

/**
 * One answer in a battle. Wrong costs 1 Resolve; at 0 the battle is lost. Answering the last
 * question with Resolve left wins. The answer also counts in the Weakness Bank, like a check answer.
 * Automatic powers (Sanctuary, Lucky, Second Wind) act here; `luckyQuestionId` is the new question
 * Lucky would offer (see `luckyQuestion`), or null.
 */
export function resolveBossAnswer(
  state: EncounterState,
  campaignStatus: string,
  item: AssessmentItem,
  answer: Answer | null,
  weakness: WeaknessState | null,
  now: Date,
  luckyQuestionId: string | null = null,
  config: LearningConfig = defaultLearningConfig,
): ({ ok: true } & BossAnswerOutcome) | BossRefusal {
  if (campaignStatus !== 'active') return { ok: false, code: 'campaign_inactive', message: 'Resume this campaign to continue the battle.' };
  if (state.status !== 'active') return { ok: false, code: 'not_active', message: 'This battle is over.' };
  if (state.questionIds[state.position] !== item.key) return { ok: false, code: 'wrong_question', message: 'That isn’t the current question.' };
  if (item.kind === 'written') return { ok: false, code: 'wrong_question', message: 'Bosses don’t use written questions yet.' };
  const result = gradeItem(item, answer);
  const lucky = luckyQuestionId !== null && !state.questionIds.includes(luckyQuestionId) && state.questionIds.length < bossConfig.maxQuestionsWithLucky;
  const effect = automaticEffect(result.correct, state.powers, new Set(state.powersUsed), state.resolve, state.maxResolve, lucky);
  const resolve = state.resolve + effect.delta;
  const position = state.position + 1;
  const questionIds = effect.power === 'lucky'
    ? [...state.questionIds.slice(0, position), luckyQuestionId!, ...state.questionIds.slice(position)]
    : state.questionIds;
  const status = resolve <= 0 ? 'lost' : position >= questionIds.length ? 'won' : 'active';
  const w = applyAnswerToWeakness(weakness, result, now, config);
  const changed = w.state && w.event !== 'none' && w.event !== 'not_due' ? { state: w.state, event: w.event } : null;
  const xp = status === 'won' ? planXpAward({ kind: 'boss_defeated', sourceId: `${state.campaignId}/stage-${state.stage}`, campaignId: state.campaignId }) : null;
  return { ok: true, correct: result.correct, resolve, position, status, conceptId: item.concept, weakness: changed, xp, power: effect.power, questionIds };
}
