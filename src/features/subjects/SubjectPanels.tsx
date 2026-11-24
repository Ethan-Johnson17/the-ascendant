import { useEffect, useId, useMemo, useState } from 'react';
import { Check, ExternalLink, Flag, FlaskConical, Hammer, Layers, Lock, Sparkles, TriangleAlert, XCircle } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { Panel } from '../../components/ui/Panel.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx';
import { createAiClient } from '../../services/ai/aiClient.ts';
import { cn } from '../../utils/cn.ts';
import { deeperStatus } from '../../engine/learning/deeper.ts';
import { projectStatus } from '../../engine/learning/projects.ts';
import { masteryStages } from '../../engine/character/attributeGrowth.ts';
import type { CompetencyView, ObjectiveView } from '../../services/learning/learningData.ts';
import { adviceNote, useCourses, type CourseInfo } from './CoursesProvider.tsx';

/** The labels every AI-made course and lesson carries (GAME_DESIGN.md "AI-made subjects"). */
export function GeneratedLabels({ course }: { course: CourseInfo }) {
  const g = course.generated;
  if (!g) return null;
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ash">
        {g.origin === 'fixture' ? (
          <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture: placeholder text, not AI</Badge>
        ) : (
          <Badge tone="arcane"><Sparkles className="size-3" aria-hidden />AI-generated, not reviewed by a person</Badge>
        )}
        <span>Written from Wikipedia; every section quotes its source, checked automatically.</span>
      </p>
      {g.adviceArea !== 'none' && <Notice tone="warning">{adviceNote[g.adviceArea]}</Notice>}
    </div>
  );
}

/**
 * The course plan of an AI-made subject: its 4 lessons, which are built, and the button that builds
 * the next one (2 AI requests). Also closes the subject to free a slot.
 */
export function SubjectPlanPanel({ course, completedLessonIds, campaignActive, onBuilt, hasProject, lessonSkills }: {
  course: CourseInfo; completedLessonIds: ReadonlySet<string>; campaignActive: boolean; onBuilt: () => Promise<void>;
  /** For the practical project: whether it is written, and the skills the lessons teach. */
  hasProject: boolean; lessonSkills: readonly CompetencyView[];
}) {
  const { client } = useAuth();
  const game = useGame();
  const courses = useCourses();
  const api = useMemo(() => (client ? createAiClient(client) : null), [client]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const g = course.generated!;
  const nextIndex = g.lessons.findIndex((l) => !l.built);
  const next = g.lessons[nextIndex];
  const prev = g.lessons[nextIndex - 1];
  const prevDone = !prev || completedLessonIds.has(`${course.id}/${prev.key}`);

  const build = async () => {
    if (!api || busy) return;
    setBusy(true);
    setMessage(null);
    const r = await api.buildLesson(course.id);
    if (r.ok) {
      await Promise.all([courses.reload(), onBuilt()]);
      const dropped = r.data.droppedParts + r.data.droppedQuestions;
      setMessage({ tone: 'info', text: `Lesson ready.${dropped ? ` ${dropped} part${dropped === 1 ? '' : 's'} that couldn’t be backed up by the source ${dropped === 1 ? 'was' : 'were'} left out.` : ''}` });
    } else setMessage({ tone: 'warning', text: r.error });
    setBusy(false);
  };

  const close = async () => {
    if (!client) return;
    setConfirmClose(false);
    const { data, error } = await client.rpc('close_generated_subject', { p_template_id: course.id });
    if (error || data !== true) {
      setMessage({ tone: 'warning', text: 'Couldn’t close this subject. Please try again.' });
      return;
    }
    await Promise.all([courses.reload(), game.reload()]);
    setMessage({ tone: 'info', text: 'Subject closed. Your XP and records are kept, and you can still read its lessons.' });
  };

  return (
    <Panel eyebrow="Your subject" title="Course plan">
      <ol className="space-y-2">
        {g.lessons.map((l, i) => (
          <li key={l.key} className={cn('flex items-start gap-3 rounded-control border px-3 py-2.5', l.built ? 'border-iron bg-charcoal/60' : 'border-iron/60 bg-obsidian/40')}>
            <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-xs', l.built ? 'border-vital/60 text-vital' : 'border-iron text-smoke')}>
              {l.built ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('font-medium', l.built ? 'text-ink' : 'text-ash')}>{l.title}</p>
              <p className="text-xs text-smoke">
                {l.built ? 'Built · ' : 'Not built yet · '}from{' '}
                <a href={l.article.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-gold-300 underline decoration-gold-700 underline-offset-2">
                  {l.article.title} (Wikipedia)<ExternalLink className="size-3" aria-label="(opens in a new tab)" />
                </a>
              </p>
            </div>
          </li>
        ))}
      </ol>

      {g.closed ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ash"><Lock className="size-4" aria-hidden />This subject is closed. Its lessons stay readable; no new lessons are built.</p>
      ) : next ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={busy || !prevDone || !campaignActive} onClick={() => void build()} icon={<Hammer className="size-4" aria-hidden />}>
            {busy ? 'Writing and checking the lesson…' : nextIndex === 0 ? 'Build the first lesson' : 'Build the next lesson'}
          </Button>
          <span className="text-xs text-smoke">
            {!campaignActive ? 'Resume the campaign to build lessons.' : !prevDone ? `Complete “${prev!.title}” first.` : 'Uses 2 of your daily AI requests (the lesson and its check). Takes up to a minute.'}
          </span>
        </div>
      ) : (
        <p className="mt-4 text-sm text-vital">Every lesson in this course is built.</p>
      )}

      <div aria-live="polite">{message && <Notice tone={message.tone} className="mt-4">{message.text}</Notice>}</div>

      {!g.closed && (
        <ProjectLine course={course} hasProject={hasProject} lessonSkills={lessonSkills} campaignActive={campaignActive} onBuilt={onBuilt} />
      )}

      {!g.closed && (
        <div className="mt-5 border-t border-iron/60 pt-4">
          <Button variant="ghost" icon={<XCircle className="size-4" aria-hidden />} onClick={() => setConfirmClose(true)}>Close this subject</Button>
          <p className="mt-1 text-xs text-smoke">Frees one of your AI-made subject slots. Nothing is deleted: XP, mastery and the Codex are kept.</p>
        </div>
      )}
      <ConfirmDialog
        open={confirmClose}
        title="Close this subject?"
        confirmLabel="Close subject"
        onConfirm={() => void close()}
        onCancel={() => setConfirmClose(false)}
      >
        The campaign is paused and no more lessons will be built. You keep all XP and records and can still read its lessons. This can’t be undone.
      </ConfirmDialog>
    </Panel>
  );
}

/** "Report a mistake" for one lesson: saved for review, and the lesson shows a flag. */
export function ReportMistake({ activityId }: { activityId: string }) {
  const { client } = useAuth();
  const { isSample } = useGame();
  const [reported, setReported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!client || isSample) return;
    let live = true;
    void client.from('content_reports').select('id').eq('activity_id', activityId).then(({ data }) => {
      if (live) setReported((data ?? []).length > 0);
    });
    return () => {
      live = false;
    };
  }, [client, isSample, activityId]);

  if (!client || isSample) return null;
  if (reported) {
    return <Notice tone="warning"><span className="inline-flex items-center gap-2"><TriangleAlert className="size-4" aria-hidden />A player reported a possible mistake here. Your report is saved for review.</span></Notice>;
  }
  const send = async () => {
    if (text.trim().length < 5 || busy) return;
    setBusy(true);
    const { error: err } = await client.from('content_reports').insert({ activity_id: activityId, message: text.trim() });
    setBusy(false);
    if (err) {
      setError(err.code === '23505' ? 'You’ve already reported this lesson.' : 'Couldn’t send the report. Please try again.');
      return;
    }
    setReported(true);
  };
  return (
    <div>
      {!open ? (
        <Button variant="ghost" icon={<Flag className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Report a mistake</Button>
      ) : (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor={id} className="text-sm text-ash">What looks wrong? (5 to 1,000 characters)</label>
          <textarea id={id} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} className="min-h-24 w-full rounded-control border border-iron bg-obsidian px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-gold-300" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || text.trim().length < 5}>{busy ? 'Sending…' : 'Send report'}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {error && <p className="text-sm text-warning" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}

/**
 * "Go deeper" under a lesson of an AI-made course: writes the lesson's next harder check (1 AI
 * request), from the lesson's own text. Offered only when the player could take that check now;
 * otherwise it says what to reach first, so no request is spent on a check that can't be used.
 */
export function GoDeeper({ course, objective, competencies, campaignActive, onBuilt }: {
  course: CourseInfo; objective: ObjectiveView; competencies: readonly CompetencyView[]; campaignActive: boolean; onBuilt: () => Promise<void>;
}) {
  const { client } = useAuth();
  const api = useMemo(() => (client ? createAiClient(client) : null), [client]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const lesson = objective.activities.find((a) => a.kind === 'lesson');
  if (!lesson || course.generated?.closed || !campaignActive) return null;
  const skill = competencies.find((c) => c.id === lesson.competencyIds[0]);
  const status = deeperStatus(objective.activities.filter((a) => a.kind === 'assessment').map((a) => a.targetStage), skill?.stage ?? 1);
  const stageName = (s: number) => masteryStages[s - 1] ?? 'the next stage';

  const deepen = async () => {
    if (!api || busy) return;
    setBusy(true);
    setMessage(null);
    const r = await api.deepenLesson(course.id, lesson.key);
    if (r.ok) {
      await onBuilt();
      const dropped = r.data.droppedQuestions;
      setMessage({ tone: 'info', text: `${stageName(r.data.stage)} check ready.${dropped ? ` ${dropped} question${dropped === 1 ? '' : 's'} that couldn’t be backed up by the lesson ${dropped === 1 ? 'was' : 'were'} left out.` : ''}` });
    } else setMessage({ tone: 'warning', text: r.error });
    setBusy(false);
  };

  return (
    <div className="mt-2" aria-live="polite">
      {status.kind === 'ready' ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="secondary" disabled={busy} onClick={() => void deepen()} icon={<Layers className="size-4" aria-hidden />}>
            {busy ? 'Writing and checking…' : `Go deeper: write the ${stageName(status.stage)} check`}
          </Button>
          <span className="text-xs text-smoke">
            {status.stage === 5 ? 'Written answers only, marked by the Examiner. ' : 'Harder questions from this lesson. '}Uses 1 of your daily AI requests.
          </span>
        </div>
      ) : status.kind === 'waiting' ? (
        <p className="flex items-center gap-1.5 text-xs text-smoke">
          <Layers className="size-3.5" aria-hidden />Go deeper: reach {stageName(status.needs)} in {skill?.name ?? 'this skill'} to unlock a harder {stageName(status.stage)} check.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-smoke"><Layers className="size-3.5" aria-hidden />Every check up to Advanced is here.</p>
      )}
      {message && <Notice tone={message.tone} className="mt-2">{message.text}</Notice>}
    </div>
  );
}

/**
 * The course's practical project: written once by the Course Builder (1 AI request) when every lesson
 * is built and every skill the lessons teach is Proficient. Until then it says what is still needed.
 */
function ProjectLine({ course, hasProject, lessonSkills, campaignActive, onBuilt }: {
  course: CourseInfo; hasProject: boolean; lessonSkills: readonly CompetencyView[]; campaignActive: boolean; onBuilt: () => Promise<void>;
}) {
  const { client } = useAuth();
  const api = useMemo(() => (client ? createAiClient(client) : null), [client]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const status = projectStatus({ hasProject, allBuilt: course.generated!.lessons.every((l) => l.built), competencies: lessonSkills });

  const write = async () => {
    if (!api || busy) return;
    setBusy(true);
    setMessage(null);
    const r = await api.writeProject(course.id);
    if (r.ok) {
      await onBuilt();
      setMessage({ tone: 'info', text: 'Project ready. You’ll find it at the end of your path.' });
    } else setMessage({ tone: 'warning', text: r.error });
    setBusy(false);
  };

  return (
    <div className="mt-5 border-t border-iron/60 pt-4" aria-live="polite">
      <p className="text-xs uppercase tracking-wider text-smoke">Practical project</p>
      {status.kind === 'written' ? (
        <p className="mt-1 text-sm text-vital">Written. It’s at the end of your path: one task that proves Advanced.</p>
      ) : status.kind === 'ready' ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="secondary" disabled={busy || !campaignActive} onClick={() => void write()} icon={<Hammer className="size-4" aria-hidden />}>
            {busy ? 'Writing the project…' : 'Write the project'}
          </Button>
          <span className="text-xs text-smoke">{campaignActive ? 'One task that uses the whole course. Uses 1 of your daily AI requests, once.' : 'Resume the campaign first.'}</span>
        </div>
      ) : (
        <p className="mt-1 text-sm text-ash">
          {status.kind === 'not_built' ? 'Opens once every lesson is built and every skill is Proficient.' : `Opens when ${status.needs.join(', ')} ${status.needs.length === 1 ? 'reaches' : 'reach'} Proficient.`}
        </p>
      )}
      {message && <Notice tone={message.tone} className="mt-2">{message.text}</Notice>}
    </div>
  );
}
