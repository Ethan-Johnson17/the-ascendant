import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardCheck, Clock, Library } from 'lucide-react';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { CertaintyBadge, LearningGate, SampleNote, SourceList } from '../features/learning/LearningUi.tsx';
import { useCampaignLearning } from '../features/learning/useCampaignLearning.ts';
import { TutorPanel } from '../features/ai/TutorPanel.tsx';
import type { CheckView, LessonView } from '../services/learning/learningData.ts';

export default function LessonPage() {
  const { campaignId, lessonKey } = useParams();
  const { campaign, load, reload, api, isSample } = useCampaignLearning(campaignId);
  const game = useGame();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);

  return (
    <LearningGate load={load} onRetry={() => void reload()}>
      {(data) => {
        const lesson = [...data.activities.values()].find((a): a is LessonView => a.kind === 'lesson' && a.key === lessonKey);
        if (!lesson) return <Notice tone="warning" title="Lesson not found">This lesson isn’t part of the campaign.</Notice>;
        const objective = data.disciplines.flatMap((d) => d.topics).flatMap((t) => t.objectives).find((o) => o.activities.some((a) => a.id === lesson.id));
        const nextCheck = objective?.activities.find((a): a is CheckView => a.kind === 'assessment');
        const back = `/campaigns/${campaign!.id}`;
        const allCitations = lesson.sections.flatMap((s) => s.citations);

        const complete = async () => {
          if (!api || busy) return;
          setBusy(true);
          const r = await api.completeLesson(campaign!.id, lesson.id);
          if (r.ok) {
            setMessage({
              tone: 'info',
              text: r.data.firstCompletion
                ? `Lesson complete. ${r.data.xp.total > 0 ? `+${r.data.xp.total} XP. ` : ''}New entries are now in your Knowledge Codex.`
                : 'You’ve already completed this lesson. Reading it again is good revision, but earns no more XP.',
            });
            await Promise.all([reload(), game.reload()]);
          } else setMessage({ tone: 'warning', text: r.error });
          setBusy(false);
        };

        return (
          <article className="space-y-6">
            <Link to={back} className="inline-flex min-h-11 items-center gap-2 text-sm text-ash hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> Back to campaign
            </Link>
            <PageHeader
              eyebrow="Lesson"
              title={lesson.title}
              subtitle={<span className="inline-flex items-center gap-2 text-base"><Clock className="size-4" aria-hidden /> About {lesson.minutes} minutes{lesson.completed && <Badge tone="vital"><Check className="size-3" aria-hidden />Completed</Badge>}</span>}
            />
            {isSample && <SampleNote />}

            <div className="space-y-5">
              {lesson.sections.map((s, i) => (
                <Panel key={i} as="section" tone="raised">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {s.heading && <h2 className="font-display text-xl font-semibold text-gold-100">{s.heading}</h2>}
                    <CertaintyBadge certainty={s.certainty} />
                  </div>
                  <div className="mt-3 space-y-3 font-serif text-lg leading-relaxed text-ink/95">
                    {s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
                  </div>
                  {s.citations.length > 0 && (
                    <p className="mt-3 text-xs text-smoke">Source: {s.citations.map((c) => c.source.title).join('; ')}</p>
                  )}
                </Panel>
              ))}
            </div>

            <Panel eyebrow="References" title="Where this comes from">
              <SourceList citations={allCitations} title="Sources for this lesson" />
              <p className="mt-4 text-xs text-smoke">
                Labels show how settled each part is: established fact, strong scholarly consensus, or debated. Lesson written by the development team; awaiting review.
              </p>
            </Panel>

            <TutorPanel campaignId={campaign!.id} lessonId={lesson.id} sources={data.sources} isSample={isSample} />

            <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>

            <div className="flex flex-wrap gap-3">
              {!isSample && campaign!.status === 'active' && !lesson.completed && (
                <Button size="lg" disabled={busy} onClick={() => void complete()} icon={<Check className="size-5" aria-hidden />}>
                  {busy ? 'Saving…' : 'Complete lesson'}
                </Button>
              )}
              {nextCheck && nextCheck.unlocked && (
                <ButtonLink to={`/campaigns/${campaign!.id}/check/${nextCheck.key}`} size="lg" variant="secondary" icon={<ClipboardCheck className="size-5" aria-hidden />}>
                  Take the check
                </ButtonLink>
              )}
              <ButtonLink to={`/codex?campaign=${campaign!.id}`} size="lg" variant="ghost" icon={<Library className="size-5" aria-hidden />}>Open Codex</ButtonLink>
            </div>
            {campaign!.status === 'paused' && !isSample && <p className="text-sm text-ash">Resume this campaign to record lessons and take checks.</p>}
          </article>
        );
      }}
    </LearningGate>
  );
}
