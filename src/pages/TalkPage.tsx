import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, FlaskConical, Library, MessageCircle, ScrollText, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../app/AuthProvider.tsx';
import { PageHeader } from '../components/ui/PageHeader.tsx';
import { Panel } from '../components/ui/Panel.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';
import { LearningGate, SampleNote } from '../features/learning/LearningUi.tsx';
import { useCampaignLearning } from '../features/learning/useCampaignLearning.ts';
import { useCourses } from '../features/subjects/CoursesProvider.tsx';
import { charactersFor, type TalkCharacter } from '../content/characters.ts';
import { createAiClient } from '../services/ai/aiClient.ts';
import { defaultAiConfig } from '../services/ai/config.ts';
import type { CampaignLearning } from '../services/learning/learningData.ts';
import { cn } from '../utils/cn.ts';

type Message = { id: number | string; speaker: 'player' | 'character'; body: string; origin: 'ai' | 'fixture' | null; suggestions: readonly string[] };

/**
 * Free talk with a course's characters (GAME_DESIGN.md "Talk with characters"). Story only: talking
 * never changes progress. Each message uses 1 daily AI request; conversations are saved (the last
 * 20 messages per character) and the player can clear them.
 */
export default function TalkPage() {
  const { campaignId } = useParams();
  const { campaign, load, reload, isSample } = useCampaignLearning(campaignId);
  const { courseInfo } = useCourses();
  const template = campaign ? courseInfo(campaign.templateId) : null;
  return (
    <LearningGate load={load} onRetry={() => void reload()}>
      {(data) => (
        <div className="space-y-6">
          <Link to={`/campaigns/${campaign!.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gold-300 hover:text-gold-200">
            <ArrowLeft className="size-4" aria-hidden />Back to campaign
          </Link>
          <PageHeader eyebrow="Talk" title={template?.title ?? 'Campaign'} subtitle="Speak with the people of this journey." />
          {isSample ? <SampleNote /> : <Conversations campaignId={campaign!.id} templateId={campaign!.templateId} data={data} />}
        </div>
      )}
    </LearningGate>
  );
}

function Conversations({ campaignId, templateId, data }: { campaignId: string; templateId: string; data: CampaignLearning }) {
  const characters = charactersFor(templateId);
  const [selected, setSelected] = useState<TalkCharacter>(characters[0]!);
  const nextLesson = data.disciplines.flatMap((d) => d.topics).flatMap((t) => t.objectives).flatMap((o) => o.activities).find((a) => a.kind === 'lesson' && !a.completed);
  const hrefs: Record<string, { to: string; label: string; icon: React.ReactNode }> = {
    ...(nextLesson ? { next_lesson: { to: `/campaigns/${campaignId}/lesson/${nextLesson.key}`, label: `Next lesson: ${nextLesson.title}`, icon: <BookOpen className="size-4" aria-hidden /> } } : {}),
    quests: { to: `/campaigns/${campaignId}/quests`, label: 'Your quests', icon: <ScrollText className="size-4" aria-hidden /> },
    codex: { to: `/codex?campaign=${campaignId}`, label: 'The Codex', icon: <Library className="size-4" aria-hidden /> },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <Panel eyebrow="Characters" title="Who to talk to">
        <ul className="space-y-2">
          {characters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={c.id === selected.id}
                aria-label={`${c.name}: ${c.role}`}
                onClick={() => setSelected(c)}
                className={cn('flex min-h-14 w-full items-center gap-3 rounded-control border px-3 py-2.5 text-left transition-colors',
                  c.id === selected.id ? 'border-gold-500 bg-gold-900/20' : 'border-iron bg-charcoal/60 hover:border-gold-600')}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold-600 text-gold-300"><MessageCircle className="size-4" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-ash">{c.role}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-smoke">
          Characters are voiced by the AI (the Game Master). Talking is story only: it never changes your XP or progress. They speak only
          about ideas you’ve unlocked in the Codex, so check your lessons for the full, sourced account.
        </p>
      </Panel>
      <Conversation key={selected.id} campaignId={campaignId} character={selected} hrefs={hrefs} />
    </div>
  );
}

function Conversation({ campaignId, character, hrefs }: { campaignId: string; character: TalkCharacter; hrefs: Record<string, { to: string; label: string; icon: React.ReactNode }> }) {
  const { client } = useAuth();
  const api = useMemo(() => (client ? createAiClient(client) : null), [client]);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const max = defaultAiConfig.talk.maxMessageChars;

  const loadMessages = useCallback(async () => {
    if (!client) return;
    const { data, error: e } = await client.from('talk_messages').select('id, speaker, body, origin, suggestions')
      .eq('campaign_id', campaignId).eq('character_id', character.id).order('id');
    if (e) return setError('Couldn’t load this conversation. Please try again.');
    setMessages((data ?? []) as Message[]);
  }, [client, campaignId, character.id]);
  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const send = async () => {
    const text = draft.trim();
    if (!api || busy || !text) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...(m ?? []), { id: `pending-${Date.now()}`, speaker: 'player', body: text, origin: null, suggestions: [] }]);
    const r = await api.talk(campaignId, character.id, text);
    if (r.ok) {
      setDraft('');
      await loadMessages();
    } else {
      setError(r.error);
      await loadMessages();
    }
    setBusy(false);
  };

  const clear = async () => {
    setConfirmClear(false);
    if (!client) return;
    const { error: e } = await client.from('talk_messages').delete().eq('campaign_id', campaignId).eq('character_id', character.id);
    if (e) return setError('Couldn’t clear this conversation. Please try again.');
    await loadMessages();
  };

  return (
    <Panel eyebrow={character.role} title={character.name}>
      <ol className="space-y-3" aria-live="polite">
        <li className="rounded-control border border-iron bg-charcoal/60 px-3 py-2.5">
          <p className="font-serif text-ink">{character.greeting}</p>
        </li>
        {(messages ?? []).map((m) => (
          <li key={m.id} className={cn('rounded-control border px-3 py-2.5', m.speaker === 'player' ? 'ml-8 border-gold-700/60 bg-gold-900/10' : 'mr-8 border-iron bg-charcoal/60')}>
            <p className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-smoke">
              {m.speaker === 'player' ? 'You' : character.name}
              {m.origin === 'fixture' && <Badge tone="warning"><FlaskConical className="size-3" aria-hidden />Development fixture, not AI</Badge>}
            </p>
            {m.body.split('\n\n').map((p, i) => <p key={i} className={cn('text-ink', m.speaker === 'character' && 'font-serif', i > 0 && 'mt-2')}>{p}</p>)}
            {m.speaker === 'character' && m.suggestions.some((s) => hrefs[s]) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.suggestions.filter((s) => hrefs[s]).map((s) => (
                  <ButtonLink key={s} to={hrefs[s]!.to} variant="secondary" icon={hrefs[s]!.icon}>{hrefs[s]!.label}</ButtonLink>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {messages === null && !error && <p className="mt-3 text-sm text-smoke">Loading the conversation…</p>}
      {error && <Notice tone="warning" className="mt-3">{error}</Notice>}

      <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label htmlFor="talk-message" className="text-sm text-ash">Say something to {character.name}</label>
        <textarea
          id="talk-message"
          value={draft}
          maxLength={max}
          rows={3}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          className="mt-1 w-full rounded-control border border-iron bg-obsidian px-3 py-2 text-ink placeholder:text-smoke focus:border-gold-500 focus:outline-none"
          placeholder="Ask a question, or just say hello."
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !draft.trim()} icon={<Send className="size-4" aria-hidden />}>{busy ? `${character.name} is answering…` : 'Send'}</Button>
          <span className="text-xs text-smoke">{draft.length}/{max} · uses 1 of your daily AI requests</span>
          {(messages?.length ?? 0) > 0 && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmClear(true)} icon={<Trash2 className="size-4" aria-hidden />}>Clear conversation</Button>
          )}
        </div>
        <p className="mt-1 text-xs text-smoke">The last {defaultAiConfig.talk.keepMessages} messages with each character are kept in your account.</p>
      </form>

      <ConfirmDialog open={confirmClear} title="Clear this conversation?" confirmLabel="Clear" onConfirm={() => void clear()} onCancel={() => setConfirmClear(false)}>
        {character.name} will forget what you talked about. Your progress isn’t affected. This can’t be undone.
      </ConfirmDialog>
    </Panel>
  );
}
