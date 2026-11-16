import { useMemo, useState } from 'react';
import { BookOpen, ClipboardCheck, FlaskConical, Hourglass, Sparkles, Target } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { Panel } from '../../components/ui/Panel.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { planNextSteps, type NextStep, type NextStepKind, type PlanCheck, type PlanLesson } from '../../engine/learning/nextSteps.ts';
import { createAiClient, type AdviceReply } from '../../services/ai/aiClient.ts';
import type { CampaignLearning } from '../../services/learning/learningData.ts';
import { useCampaignLearning } from './useCampaignLearning.ts';

/** The engine's plan from the player's own records (see src/engine/learning/nextSteps.ts). */
export function nextStepsFor(data: CampaignLearning, max = 3): NextStep[] {
  const activities = data.disciplines.flatMap((d) => d.topics.flatMap((t) => t.objectives.flatMap((o) => o.activities)));
  return planNextSteps(
    {
      activities: activities.map<PlanLesson | PlanCheck>((a) =>
        a.kind === 'lesson'
          ? { kind: 'lesson', id: a.id, key: a.key, title: a.title, completed: a.completed }
          : { kind: 'assessment', id: a.id, key: a.key, title: a.title, competencyIds: a.competencyIds, targetStage: a.targetStage, unlocked: a.unlocked, reviewDue: a.reviewDue },
      ),
      competencies: data.competencies.map((c) => ({ id: c.id, stage: c.stage })),
      weaknesses: data.weaknesses,
    },
    max,
  );
}

const kindLabel: Record<NextStepKind, { label: string; icon: typeof BookOpen; tone: 'gold' | 'warning' | 'arcane' | 'neutral' }> = {
  review: { label: 'Review due', icon: Hourglass, tone: 'arcane' },
  weakness: { label: 'Weakness review', icon: Target, tone: 'warning' },
  lesson: { label: 'Lesson', icon: BookOpen, tone: 'neutral' },
  check: { label: 'Knowledge check', icon: ClipboardCheck, tone: 'gold' },
};

type Advice = { state: 'idle' } | { state: 'busy' } | { state: 'ready'; reply: AdviceReply } | { state: 'error'; message: string };

/**
 * "Next steps" for a campaign: always the engine's plan; on request, the Progression Advisor (AI)
 * explains it in friendlier words, using one of the player's daily AI requests.
 */
export function NextStepsPanel({ campaignId }: { campaignId: string }) {
  const { campaign, load, isSample } = useCampaignLearning(campaignId);
  const { client } = useAuth();
  const api = useMemo(() => (client && !isSample ? createAiClient(client) : null), [client, isSample]);
  const [advice, setAdvice] = useState<Advice>({ state: 'idle' });

  if (load.state !== 'ready' || !campaign) return null;
  const data = load.data;
  if (!data.hasCurriculum) return null;
  const steps = nextStepsFor(data);
  const reply = advice.state === 'ready' ? advice.reply : null;
  // An explanation belongs to the plan it was given for; if the plan changed, drop it.
  const matches = reply && reply.advice.steps.length === steps.length && reply.advice.steps.every((s, i) => s.activityId === steps[i]!.activityId);
  const whyOf = (s: NextStep, i: number) => (matches ? reply!.advice.steps[i]!.why : s.kind === 'weakness' && s.concept ? `Review “${s.concept}”. ${s.reason}` : s.reason);

  const explain = async () => {
    if (!api) return;
    setAdvice({ state: 'busy' });
    const r = await api.advise(campaignId, steps.map((s) => ({ kind: s.kind, activityId: s.activityId })));
    setAdvice(r.ok ? { state: 'ready', reply: r.data } : { state: 'error', message: r.error });
  };

  return (
    <Panel eyebrow="Progression Advisor" title="Next steps">
      {steps.length === 0 ? (
        <p className="text-ash">You’re up to date: nothing is due and every available step is done. Reviews will come due over the next few days.</p>
      ) : (
        <div className="space-y-4">
          {matches && (
            <p className="flex flex-wrap items-center gap-2 text-ink">
              {reply!.origin === 'fixture' ? (
                <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture</Badge>
              ) : (
                <Badge tone="arcane"><Sparkles className="size-3" aria-hidden />Advisor (AI)</Badge>
              )}
              <span>{reply!.advice.summary}</span>
            </p>
          )}
          <ol className="space-y-3">
            {steps.map((s, i) => {
              const k = kindLabel[s.kind];
              const Icon = k.icon;
              const to = `/campaigns/${campaignId}/${s.activityKind === 'lesson' ? 'lesson' : 'check'}/${s.activityKey}`;
              return (
                <li key={s.activityId} className="flex flex-col gap-3 rounded-control border border-iron bg-charcoal p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <Badge tone={k.tone}><Icon className="size-3" aria-hidden />{k.label}</Badge>
                    <p className="mt-1.5 font-serif text-lg leading-snug text-ink">{s.title}</p>
                    <p className="mt-0.5 text-sm text-ash">{whyOf(s, i)}</p>
                  </div>
                  <ButtonLink to={to} variant={i === 0 ? 'primary' : 'secondary'} className="shrink-0">
                    {s.activityKind === 'lesson' ? 'Read' : 'Start'}
                  </ButtonLink>
                </li>
              );
            })}
          </ol>
          {api && !matches && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="ghost" disabled={advice.state === 'busy'} onClick={() => void explain()} icon={<Sparkles className="size-4" aria-hidden />}>
                {advice.state === 'busy' ? 'Asking the Advisor…' : 'Explain my plan'}
              </Button>
              <span className="text-xs text-smoke">The Advisor (AI) explains this plan. Uses 1 of your daily AI requests.</span>
            </div>
          )}
          {advice.state === 'error' && <Notice tone="warning">{advice.message}</Notice>}
        </div>
      )}
    </Panel>
  );
}
