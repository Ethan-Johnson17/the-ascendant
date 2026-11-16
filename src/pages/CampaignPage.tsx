import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, ClipboardCheck, Clock, Library, Lock, RotateCcw, Target } from 'lucide-react';
import { useAuth } from '../app/AuthProvider.tsx';
import { useGame } from '../app/GameProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { LevelProgress } from '../features/progression/LevelProgress.tsx';
import { LearningGate, SampleNote, StagePips } from '../features/learning/LearningUi.tsx';
import { useCampaignLearning } from '../features/learning/useCampaignLearning.ts';
import { useCourses } from '../features/subjects/CoursesProvider.tsx';
import { GeneratedLabels, SubjectPlanPanel } from '../features/subjects/SubjectPanels.tsx';
import { defaultProgressionConfig } from '../engine/progression/config.ts';
import { masteryStages } from '../engine/character/attributeGrowth.ts';
import type { DifficultyPreference } from '../engine/learning/config.ts';
import { setDifficultyPreference, type ActivityView, type CampaignLearning, type CompetencyView } from '../services/learning/learningData.ts';
import { RepositoryError } from '../services/game/gameRepository.ts';
import { cn } from '../utils/cn.ts';

const retentionLabel: Record<CompetencyView['retention'], { text: string; tone: 'neutral' | 'vital' | 'warning' | 'ember' }> = {
  not_started: { text: 'Not started', tone: 'neutral' },
  fresh: { text: 'Remembered', tone: 'vital' },
  due: { text: 'Review due', tone: 'warning' },
  needs_review: { text: 'Needs review', tone: 'ember' },
};

export default function CampaignPage() {
  const { campaignId } = useParams();
  const { campaign, load, reload, isSample } = useCampaignLearning(campaignId);
  const { resumeCampaign } = useGame();
  const { courseInfo } = useCourses();
  const template = campaign ? courseInfo(campaign.templateId) : null;
  const [resumeError, setResumeError] = useState<string | null>(null);

  return (
    <LearningGate load={load} onRetry={() => void reload()}>
      {(data) => (
        <div className="space-y-6">
          <PageHeader
            eyebrow={template ? `${template.subject} · ${template.module}` : 'Campaign'}
            title={template?.title ?? 'Campaign'}
            subtitle={`${data.counts.lessonsDone} of ${data.counts.lessons} lessons read · ${data.counts.checksPassed} of ${data.counts.checks} checks passed`}
            actions={
              <>
                <ButtonLink to={`/codex?campaign=${campaign!.id}`} variant="secondary" icon={<Library className="size-4" aria-hidden />}>Codex</ButtonLink>
                <ButtonLink to={`/weaknesses?campaign=${campaign!.id}`} variant="secondary" icon={<Target className="size-4" aria-hidden />}>
                  Weakness Bank{data.weaknesses.filter((w) => w.status === 'open').length ? ` (${data.weaknesses.filter((w) => w.status === 'open').length})` : ''}
                </ButtonLink>
              </>
            }
          />

          {isSample && <SampleNote />}
          {template?.generated && <GeneratedLabels course={template} />}
          {campaign!.status === 'paused' && !isSample && (
            <Notice tone="warning" title="This campaign is paused">
              You can read its lessons, but resume it to take checks and earn progress.
              <div className="mt-3">
                <Button variant="secondary" onClick={async () => {
                  const r = await resumeCampaign(campaign!.id);
                  setResumeError(r.ok ? null : r.error);
                }}>Resume campaign</Button>
                {resumeError && <p className="mt-2 text-warning">{resumeError}</p>}
              </div>
            </Notice>
          )}
          {data.counts.reviewsDue > 0 && !isSample && (
            <Notice title="Reviews are due">
              {data.counts.reviewsDue === 1 ? 'One review is' : `${data.counts.reviewsDue} reviews are`} ready. Reviewing on time keeps knowledge fresh and clears your Weakness Bank.
            </Notice>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Curriculum data={data} campaignId={campaign!.id} generated={!!template?.generated} />
            <div className="space-y-6">
              {template?.generated && !isSample && (
                <SubjectPlanPanel
                  course={template}
                  campaignActive={campaign!.status === 'active'}
                  completedLessonIds={new Set([...data.activities.values()].filter((a) => a.kind === 'lesson' && a.completed).map((a) => a.id))}
                  onBuilt={reload}
                />
              )}
              <Panel eyebrow="Campaign progress" title="Level">
                <LevelProgress totalXp={campaign!.campaignXp} curve={defaultProgressionConfig.campaignLevels} label="Campaign" compact />
              </Panel>
              {!isSample && <DifficultyControl campaignId={campaign!.id} value={data.preference} onSaved={() => void reload()} />}
            </div>
          </div>

          <CompetencyMatrix competencies={data.competencies} noContentLabel={template?.generated ? 'No lessons yet' : 'Lessons in Phase 6'} />
        </div>
      )}
    </LearningGate>
  );
}

function Curriculum({ data, campaignId, generated }: { data: CampaignLearning; campaignId: string; generated: boolean }) {
  if (!data.hasCurriculum || (generated && data.counts.lessons === 0)) {
    return (
      <Panel eyebrow="Curriculum" title={generated ? 'Your course is planned' : 'Lessons are being written'}>
        <p className="text-ash">{generated ? 'No lessons are built yet. Build the first one from the course plan.' : 'This campaign has no lessons yet.'}</p>
      </Panel>
    );
  }
  return (
    <Panel eyebrow="Curriculum" title="Your path">
      <div className="space-y-8">
        {data.disciplines.flatMap((d) => d.topics).map((t) => (
          <section key={t.id} aria-labelledby={t.id}>
            <h3 id={t.id} className="font-display text-lg font-semibold text-gold-100">{t.title}</h3>
            <p className="mt-0.5 text-sm text-ash">{t.summary}</p>
            {t.objectives.map((o) => (
              <div key={o.id} className="mt-4">
                <p className="text-xs uppercase tracking-wider text-smoke">Goal</p>
                <p className="font-serif text-ink">{o.statement}</p>
                {o.activities.length === 0 ? (
                  <p className="mt-2 text-sm text-smoke">Not built yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {o.activities.map((a) => <li key={a.id}><ActivityRow activity={a} campaignId={campaignId} /></li>)}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </Panel>
  );
}

function ActivityRow({ activity: a, campaignId }: { activity: ActivityView; campaignId: string }) {
  const locked = a.kind === 'assessment' && !a.unlocked;
  const to = `/campaigns/${campaignId}/${a.kind === 'lesson' ? 'lesson' : 'check'}/${a.key}`;
  const body = (
    <div className={cn('flex min-h-14 items-center gap-3 rounded-control border px-3 py-2.5 transition-colors', locked ? 'border-iron/60 bg-obsidian/40 text-smoke' : 'border-iron bg-charcoal/60 hover:border-gold-600')}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full border', a.kind === 'lesson' && a.completed ? 'border-vital/60 text-vital' : 'border-gold-600 text-gold-300', locked && 'border-iron text-smoke')}>
        {locked ? <Lock className="size-4" aria-hidden /> : a.kind === 'lesson' ? (a.completed ? <Check className="size-4" aria-hidden /> : <BookOpen className="size-4" aria-hidden />) : <ClipboardCheck className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-medium', locked ? 'text-smoke' : 'text-ink')}>{a.title}</p>
        <p className="text-xs text-ash">
          {a.kind === 'lesson'
            ? <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden />{a.minutes} min · {a.completed ? 'Read' : 'Lesson'}</span>
            : locked
              ? `Locked: reach ${masteryStages[a.targetStage - 2] ?? 'the previous stage'} first`
              : `${a.questionCount} questions · proves ${a.targetStageName}${a.passes ? ` · passed ${a.passes}×, best ${Math.round((a.bestScore ?? 0) * 100)}%` : ''}`}
        </p>
      </div>
      {a.kind === 'assessment' && a.reviewDue && a.unlocked && <Badge tone="warning"><RotateCcw className="size-3" aria-hidden />Review</Badge>}
      {!locked && <ChevronRight className="size-4 text-gold-500" aria-hidden />}
    </div>
  );
  return locked ? <div aria-disabled="true">{body}</div> : <Link to={to} className="block rounded-control focus-visible:outline-2 focus-visible:outline-gold-300">{body}</Link>;
}

function DifficultyControl({ campaignId, value, onSaved }: { campaignId: string; value: DifficultyPreference; onSaved: () => void }) {
  const { client } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options: { v: DifficultyPreference; label: string }[] = [
    { v: -1, label: 'Easier' },
    { v: 0, label: 'Automatic' },
    { v: 1, label: 'Harder' },
  ];
  return (
    <Panel eyebrow="Questions" title="Difficulty">
      <p className="text-sm text-ash">The game adjusts difficulty to how you’re doing. You can nudge it either way.</p>
      <div role="radiogroup" aria-label="Question difficulty" className="mt-3 grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            disabled={busy || !client}
            onClick={async () => {
              if (!client || o.v === value) return;
              setBusy(true);
              try {
                await setDifficultyPreference(client, campaignId, o.v);
                setError(null);
                onSaved();
              } catch (err) {
                setError(err instanceof RepositoryError ? err.message : 'Couldn’t save that. Please try again.');
              } finally {
                setBusy(false);
              }
            }}
            className={cn('min-h-11 rounded-control border text-sm font-medium transition-colors disabled:opacity-50', value === o.v ? 'border-gold-400 bg-gold-600/25 text-gold-100' : 'border-iron text-ash hover:border-gold-600 hover:text-ink')}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-warning" role="alert">{error}</p>}
    </Panel>
  );
}

function CompetencyMatrix({ competencies, noContentLabel }: { competencies: readonly CompetencyView[]; noContentLabel: string }) {
  return (
    <Panel eyebrow="Skill matrix" title="Competencies">
      <p className="mb-4 text-sm text-ash">Stages rise only with evidence: pass a stage’s check on two different days. Each competency feeds one attribute.</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {[...competencies].sort((a, b) => Number(b.hasContent) - Number(a.hasContent)).map((c) => {
          const r = retentionLabel[c.retention];
          return (
            <li key={c.id} className={cn('rounded-control border p-3', c.hasContent ? 'border-iron bg-charcoal/50' : 'border-iron/50 bg-obsidian/40')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-smoke">{c.subSkill} · {c.attribute.toUpperCase()}</p>
                </div>
                {c.hasContent ? <Badge tone={r.tone}>{r.text}</Badge> : <Badge>{noContentLabel}</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <StagePips stage={c.stage} />
                <span className="text-sm text-gold-200">{c.stageName}</span>
              </div>
              <p className="mt-1 text-xs text-ash">
                {c.towardNext ? `Next stage: passed on ${c.towardNext.passes} of ${c.towardNext.required} days` : c.hasContent ? 'Highest stage available from checks so far' : 'No checks yet'}
                {c.nextReviewAt && ` · next review ${c.nextReviewAt.toLocaleDateString(undefined, { dateStyle: 'medium' })}`}
                {c.openWeaknesses > 0 && ` · ${c.openWeaknesses} weak spot${c.openWeaknesses > 1 ? 's' : ''}`}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
