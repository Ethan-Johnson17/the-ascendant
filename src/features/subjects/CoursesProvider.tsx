import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { useAuth } from '../../app/AuthProvider.tsx';
import { useGame } from '../../app/GameProvider.tsx';
import { findTemplate } from '../../content/campaigns/catalog.ts';

/**
 * Every course the player can see: the built-in catalogue plus their own AI-made subjects, which
 * live in the database (campaign_templates owned by the player, and generated_subjects). Screens
 * ask `courseInfo(templateId)` instead of reading the catalogue directly.
 */

export type AdviceArea = 'none' | 'health' | 'law' | 'money';

export interface PlannedLessonView {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly built: boolean;
  readonly article: { readonly title: string; readonly url: string };
}

export interface GeneratedInfo {
  readonly origin: 'generated' | 'fixture';
  readonly adviceArea: AdviceArea;
  readonly closed: boolean;
  readonly lessons: readonly PlannedLessonView[];
}

export interface CourseInfo {
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly module: string;
  readonly description: string;
  /** Set for the player's AI-made subjects. */
  readonly generated: GeneratedInfo | null;
}

const templateRow = z.object({ id: z.string(), subject: z.string(), title: z.string(), module: z.string() });
const lessonRow = z.object({ key: z.string(), title: z.string(), summary: z.string(), built: z.boolean(), article: z.object({ title: z.string(), url: z.string() }) });
const subjectRow = z.object({
  template_id: z.string(),
  description: z.string(),
  advice_area: z.enum(['none', 'health', 'law', 'money']),
  closed_at: z.string().nullable(),
  outline: z.object({ lessons: z.array(lessonRow) }),
});
const curriculumRow = z.object({ template_id: z.string(), origin: z.string() });

interface CoursesValue {
  courseInfo(templateId: string): CourseInfo | null;
  /** The player's AI-made subjects, newest last. */
  readonly ownSubjects: readonly CourseInfo[];
  readonly openSubjects: number;
  reload(): Promise<void>;
}

const CoursesContext = createContext<CoursesValue | null>(null);

export function CoursesProvider({ children }: { children: ReactNode }) {
  const { client } = useAuth();
  const { isSample, player } = useGame();
  const [own, setOwn] = useState<readonly CourseInfo[]>([]);

  const reload = useCallback(async () => {
    if (!client || isSample) {
      setOwn([]);
      return;
    }
    const [templates, subjects] = await Promise.all([
      client.from('campaign_templates').select('id, subject, title, module').not('owner_user_id', 'is', null),
      client.from('generated_subjects').select('template_id, description, advice_area, closed_at, outline').order('created_at'),
    ]);
    if (templates.error || subjects.error) return; // Keep what we had; titles fall back to "Your subject".
    const ts = z.array(templateRow).safeParse(templates.data);
    const ss = z.array(subjectRow).safeParse(subjects.data);
    if (!ts.success || !ss.success) return;
    const ids = ss.data.map((s) => s.template_id);
    const cur = ids.length ? await client.from('curricula').select('template_id, origin').in('template_id', ids) : { data: [], error: null };
    const origins = new Map((z.array(curriculumRow).safeParse(cur.data ?? []).data ?? []).map((c) => [c.template_id, c.origin]));
    setOwn(
      ss.data.flatMap((s) => {
        const t = ts.data.find((x) => x.id === s.template_id);
        if (!t) return [];
        return [{
          ...t,
          description: s.description,
          generated: { origin: origins.get(s.template_id) === 'fixture' ? 'fixture' : 'generated', adviceArea: s.advice_area, closed: s.closed_at !== null, lessons: s.outline.lessons },
        }];
      }),
    );
  }, [client, isSample]);

  // Reload when the player's campaigns change (a new subject starts a campaign).
  const campaignKey = player.campaigns.map((c) => `${c.id}:${c.status}`).join(',');
  useEffect(() => {
    void reload();
  }, [reload, campaignKey]);

  const value = useMemo<CoursesValue>(
    () => ({
      courseInfo(templateId) {
        const mine = own.find((c) => c.id === templateId);
        if (mine) return mine;
        const t = findTemplate(templateId);
        return t ? { id: t.id, title: t.title, subject: t.subject, module: t.module, description: t.description, generated: null } : null;
      },
      ownSubjects: own,
      openSubjects: own.filter((c) => !c.generated?.closed).length,
      reload,
    }),
    [own, reload],
  );
  return <CoursesContext.Provider value={value}>{children}</CoursesContext.Provider>;
}

export function useCourses(): CoursesValue {
  const ctx = useContext(CoursesContext);
  if (!ctx) throw new Error('useCourses must be used inside <CoursesProvider>');
  return ctx;
}

export const adviceNote: Record<Exclude<AdviceArea, 'none'>, string> = {
  health: 'For learning, not personal medical advice. For your own health, talk to a qualified professional.',
  law: 'For learning, not personal legal advice. For your own situation, talk to a qualified lawyer.',
  money: 'For learning, not personal financial advice. For your own money decisions, talk to a qualified adviser.',
};
