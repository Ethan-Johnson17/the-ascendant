import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, ExternalLink, MessageCircleQuestion, Send, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../app/AuthProvider.tsx';
import { Panel } from '../../components/ui/Panel.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { TextArea } from '../../components/ui/TextField.tsx';
import { defaultAiConfig } from '../../services/ai/config.ts';
import { createAiClient, type AiStatus, type AiUsageView, type TutorReply } from '../../services/ai/aiClient.ts';
import type { SourceView } from '../../services/learning/learningData.ts';
import { cn } from '../../utils/cn.ts';

interface Turn {
  readonly question: string;
  readonly reply: TutorReply;
}

type Status = { state: 'loading' } | { state: 'ready'; status: AiStatus } | { state: 'error'; message: string };

const statusNote: Partial<Record<TutorReply['answer']['status'], string>> = {
  partly_covered: 'Only part of this is covered by the lesson.',
  not_covered: 'This lesson doesn’t cover that.',
  off_topic: 'That’s outside this lesson.',
};

const { maxQuestionChars, maxHistoryTurns, maxHistoryChars } = defaultAiConfig.tutor;

/**
 * "Ask the Tutor": questions about the lesson on screen, answered from its own material. The
 * conversation lives only on this screen (it is not saved).
 */
export function TutorPanel({ campaignId, lessonId, sources, isSample }: { campaignId: string; lessonId: string; sources: readonly SourceView[]; isSample: boolean }) {
  const { client } = useAuth();
  const api = useMemo(() => (client && !isSample ? createAiClient(client) : null), [client, isSample]);
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsageView | null>(null);
  const latest = useRef<HTMLLIElement>(null);
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s] as const)), [sources]);

  useEffect(() => {
    if (!api) return;
    let live = true;
    void api.status().then((r) => {
      if (!live) return;
      if (r.ok) {
        setStatus({ state: 'ready', status: r.data });
        setUsage(r.data.usage);
      } else setStatus({ state: 'error', message: r.error });
    });
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    latest.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns.length]);

  if (isSample) {
    return (
      <Panel eyebrow="Tutor" title="Ask the Tutor">
        <p className="text-ash">The Tutor answers questions about this lesson. It needs an account: exit the sample and sign in to use it.</p>
      </Panel>
    );
  }
  if (!api || status.state === 'loading') return null;
  if (status.state === 'error') {
    return (
      <Panel eyebrow="Tutor" title="Ask the Tutor">
        <Notice tone="warning">{status.message}</Notice>
      </Panel>
    );
  }
  if (!status.status.configured) {
    return (
      <Panel eyebrow="Tutor" title="Ask the Tutor">
        <Notice title="Not set up yet">The Tutor needs an AI service connected on the server. Everything else in the lesson works without it.</Notice>
      </Panel>
    );
  }

  const outOfQuestions = usage !== null && usage.remaining <= 0;

  const ask = async (text: string) => {
    const q = text.trim();
    if (q.length < 2 || busy || outOfQuestions) return;
    setBusy(true);
    setError(null);
    const history = turns.slice(-maxHistoryTurns).map((t) => ({ question: t.question, answer: t.reply.answer.paragraphs.map((p) => p.text).join(' ').slice(0, maxHistoryChars) }));
    const r = await api.askTutor(campaignId, lessonId, q, history);
    setBusy(false);
    if (r.ok) {
      setTurns((list) => [...list, { question: q, reply: r.data }]);
      setUsage(r.data.usage);
      setQuestion('');
    } else {
      setError(r.error);
      if (r.usage) setUsage(r.usage);
    }
  };

  return (
    <Panel eyebrow="Tutor" title="Ask the Tutor">
      <p className="text-sm text-ash">
        Ask anything about this lesson. The Tutor answers only from the lesson and its sources, and says when something isn’t covered.
      </p>
      {status.status.origin === 'fixture' && (
        <Notice tone="fixture" title="Development fixture" className="mt-3">
          No AI is connected. Answers are copied from the lesson’s Codex entries by a test stand-in, not written by an AI.
        </Notice>
      )}

      {turns.length > 0 && (
        <ol className="mt-4 space-y-4" aria-label="Your conversation with the Tutor" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} ref={i === turns.length - 1 ? latest : undefined} className="space-y-2">
              <p className="ml-auto max-w-[85%] rounded-control bg-gold-600/15 px-3 py-2 text-ink">
                <span className="sr-only">You asked: </span>
                {t.question}
              </p>
              <TutorAnswer reply={t.reply} sourceById={sourceById} onFollowUp={(f) => void ask(f)} disabled={busy || outOfQuestions} />
            </li>
          ))}
        </ol>
      )}

      {error && <Notice tone="warning" className="mt-4">{error}</Notice>}

      {outOfQuestions ? (
        <Notice className="mt-4" title="No questions left today">
          You’ve used all {usage?.limit} Tutor questions for today
          {usage?.nextFreeAt ? `. The next one frees up at ${new Date(usage.nextFreeAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}.
          Lessons, checks and the Codex still work.
        </Notice>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <TextArea
            label={turns.length ? 'Ask a follow-up' : 'Your question'}
            value={question}
            maxLength={maxQuestionChars}
            rows={2}
            placeholder="e.g. Why couldn’t farmers rely on rain?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            {...(usage ? { hint: `${usage.remaining} of ${usage.limit} questions left today` } : {})}
          />
          <Button type="submit" disabled={busy || question.trim().length < 2 || question.length > maxQuestionChars} icon={busy ? <MessageCircleQuestion className="size-4 animate-pulse" aria-hidden /> : <Send className="size-4" aria-hidden />}>
            {busy ? 'The Tutor is thinking…' : 'Ask'}
          </Button>
        </form>
      )}
      <p className="mt-3 text-xs text-smoke">The Tutor can make mistakes. The lesson text and its sources are the authority. Conversations aren’t saved.</p>
    </Panel>
  );
}

function TutorAnswer({ reply, sourceById, onFollowUp, disabled }: { reply: TutorReply; sourceById: ReadonlyMap<string, SourceView>; onFollowUp: (q: string) => void; disabled: boolean }) {
  const note = statusNote[reply.answer.status];
  return (
    <div className="max-w-[95%] rounded-control border border-iron bg-obsidian/70 px-3.5 py-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-gold-500">
        <CircleHelp className="size-3.5" aria-hidden /> {reply.origin === 'fixture' ? 'Development fixture' : 'Tutor'}
      </p>
      {note && <p className="mb-2 text-sm font-medium text-gold-200">{note}</p>}
      <div className="space-y-2.5 font-serif text-lg leading-relaxed text-ink/95">
        {reply.answer.paragraphs.map((p, i) => (
          <div key={i}>
            <p>{p.text}</p>
            {p.sourceIds.length > 0 ? (
              <p className="mt-0.5 font-sans text-xs text-smoke">
                Source:{' '}
                {p.sourceIds.map((id, j) => {
                  const s = sourceById.get(id);
                  if (!s) return null;
                  return (
                    <span key={id}>
                      {j > 0 && '; '}
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-gold-200 underline decoration-gold-600 underline-offset-2">
                          {s.title}
                          <ExternalLink className="size-3" aria-label="(opens in a new tab)" />
                        </a>
                      ) : (
                        s.title
                      )}
                    </span>
                  );
                })}
              </p>
            ) : (
              !p.supported && reply.answer.status !== 'off_topic' && reply.answer.status !== 'not_covered' && (
                <p className="mt-0.5 flex items-center gap-1 font-sans text-xs text-warning">
                  <TriangleAlert className="size-3" aria-hidden /> Not backed by this lesson’s sources: treat with care.
                </p>
              )
            )}
          </div>
        ))}
      </div>
      {reply.answer.followUps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {reply.answer.followUps.map((f) => (
            <button
              key={f}
              type="button"
              disabled={disabled}
              onClick={() => onFollowUp(f)}
              className={cn('min-h-11 rounded-control border border-iron px-3 py-1.5 text-left text-sm text-gold-200 hover:border-gold-600 disabled:opacity-50')}
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
