import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { Panel } from '../../components/ui/Panel.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { defaultAiConfig } from '../../services/ai/config.ts';
import { createAiClient, type NewSubjectRequest } from '../../services/ai/aiClient.ts';
import { cn } from '../../utils/cn.ts';
import { useCourses } from './CoursesProvider.tsx';

const levels: { v: NewSubjectRequest['startingProficiency']; label: string }[] = [
  { v: 'none', label: 'New to it' },
  { v: 'beginner', label: 'Beginner' },
  { v: 'intermediate', label: 'Some knowledge' },
  { v: 'advanced', label: 'Advanced' },
];

const field = 'min-h-11 w-full rounded-control border border-iron bg-obsidian px-3 text-ink placeholder:text-smoke focus-visible:outline-2 focus-visible:outline-gold-300';

/**
 * "Start a new subject": the player names any subject; the Course Builder (AI) plans a short
 * course from encyclopedia articles the server checks. Uses 1 AI request now and about 2 per lesson.
 */
export function NewSubjectPanel() {
  const { client } = useAuth();
  const { isSample, reload } = useGame();
  const courses = useCourses();
  const navigate = useNavigate();
  const api = useMemo(() => (client && !isSample ? createAiClient(client) : null), [client, isSample]);
  const [subject, setSubject] = useState('');
  const [objective, setObjective] = useState('');
  const [level, setLevel] = useState<NewSubjectRequest['startingProficiency']>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { subject: useId(), objective: useId() };
  const max = defaultAiConfig.courseBuilder.maxOpenSubjects;
  const full = courses.openSubjects >= max;

  if (isSample || !api) {
    return (
      <Panel eyebrow="Any subject" title="Start a new subject">
        <p className="text-ash">Sign in with an account to have the Course Builder make a course on any subject you choose.</p>
      </Panel>
    );
  }

  const valid = subject.trim().length >= 2 && objective.trim().length >= 5;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await api.createSubject({ subject: subject.trim(), objective: objective.trim(), startingProficiency: level });
    if (!r.ok) {
      setError(r.error);
      setBusy(false);
      return;
    }
    await Promise.all([reload(), courses.reload()]);
    setBusy(false);
    navigate(`/campaigns/${r.data.campaignId}`);
  };

  return (
    <Panel eyebrow="Any subject" title="Start a new subject">
      <p className="text-ash">
        Name anything you want to learn. The Course Builder (AI) plans a short course of 4 lessons, each written from an encyclopedia article our server fetches and checks.
      </p>
      <form className="mt-4 grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label htmlFor={ids.subject} className="grid gap-1.5 text-sm text-ash">
          Subject
          <input id={ids.subject} className={field} value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Beekeeping, the Roman Republic, volcanoes" disabled={busy || full} />
        </label>
        <label htmlFor={ids.objective} className="grid gap-1.5 text-sm text-ash">
          What do you want to get out of it?
          <textarea id={ids.objective} className={cn(field, 'min-h-20 py-2')} value={objective} maxLength={300} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Understand how hives work and what bees produce" disabled={busy || full} />
        </label>
        <fieldset className="grid gap-1.5 text-sm text-ash">
          <legend className="mb-1.5">How much do you know already?</legend>
          <div role="radiogroup" aria-label="Starting level" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {levels.map((l) => (
              <button
                key={l.v}
                type="button"
                role="radio"
                aria-checked={level === l.v}
                disabled={busy || full}
                onClick={() => setLevel(l.v)}
                className={cn('min-h-11 rounded-control border text-sm font-medium', level === l.v ? 'border-gold-400 bg-gold-600/25 text-gold-100' : 'border-iron text-ash hover:border-gold-600 hover:text-ink')}
              >
                {l.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={!valid || busy || full} icon={<Sparkles className="size-5" aria-hidden />}>
            {busy ? 'Planning your course…' : 'Plan my course'}
          </Button>
          <span className="text-xs text-smoke">
            {full
              ? `You have ${max} AI-made subjects open. Close one on its campaign page to start another.`
              : `Uses 1 of your daily AI requests now, then about 2 per lesson as you go. You have ${courses.openSubjects} of ${max} AI-made subjects open.`}
          </span>
        </div>
        <p className="text-xs text-smoke">Harmful topics are refused. Courses on health, law or money are for learning, not personal advice.</p>
      </form>
      {error && <Notice tone="warning" className="mt-4">{error}</Notice>}
    </Panel>
  );
}
