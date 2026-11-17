import { ArrowDown, ArrowUp, PenLine } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import type { Answer } from '../../engine/learning/grading.ts';
import type { IssuedItem } from '../../services/learning/learningClient.ts';
import { cn } from '../../utils/cn.ts';

/** Answer inputs for issued questions, shared by checks and boss battles. */

export function allAnswered(items: readonly IssuedItem[], answers: Record<string, Answer>) {
  return items.every((i) => {
    const a = answers[i.key];
    if (i.kind === 'single_choice') return typeof a === 'string';
    if (i.kind === 'ordering') return Array.isArray(a);
    if (i.kind === 'written') return typeof a === 'string' && a.trim().length > 0 && a.length <= i.maxChars;
    return !!a && typeof a === 'object' && !Array.isArray(a) && i.left.every((l) => (a as Record<string, string>)[l.key]);
  });
}

export function ItemInput({ item, value, onChange }: { item: IssuedItem; value: Answer | undefined; onChange: (v: Answer) => void }) {
  if (item.kind === 'written') {
    const text = typeof value === 'string' ? value : '';
    const id = `answer-${item.key}`;
    return (
      <div className="grid gap-1.5">
        <label htmlFor={id} className="flex items-center gap-2 text-sm text-ash">
          <PenLine className="size-4" aria-hidden /> Your answer, in your own words
        </label>
        <textarea
          id={id}
          value={text}
          maxLength={item.maxChars}
          rows={6}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-36 w-full rounded-control border border-iron bg-obsidian px-3 py-2 text-base leading-relaxed text-ink placeholder:text-smoke focus-visible:outline-2 focus-visible:outline-gold-300"
          placeholder="Two or three clear sentences are enough."
          aria-describedby={`${id}-count`}
        />
        <p id={`${id}-count`} className="text-right text-xs text-smoke">{text.length} / {item.maxChars} characters</p>
      </div>
    );
  }
  if (item.kind === 'single_choice') {
    return (
      <div role="radiogroup" aria-label="Choose one answer" className="grid gap-2">
        {item.options.map((o) => {
          const selected = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.key)}
              className={cn('flex min-h-12 items-center gap-3 rounded-control border px-4 py-2 text-left transition-colors', selected ? 'border-gold-400 bg-gold-600/20 text-gold-100' : 'border-iron bg-obsidian text-ink hover:border-gold-600')}
            >
              <span className={cn('size-4 shrink-0 rounded-full border-2', selected ? 'border-gold-300 bg-gold-300' : 'border-smoke')} aria-hidden />
              {o.text}
            </button>
          );
        })}
      </div>
    );
  }
  if (item.kind === 'ordering') {
    const order = Array.isArray(value) ? value : item.entries.map((e) => e.key);
    const text = new Map(item.entries.map((e) => [e.key, e.text] as const));
    const move = (i: number, d: -1 | 1) => {
      const next = [...order];
      const j = i + d;
      if (j < 0 || j >= next.length) return;
      [next[i], next[j]] = [next[j]!, next[i]!];
      onChange(next);
    };
    return (
      <ol className="space-y-2" aria-label="Put in order, earliest first">
        {order.map((k, i) => (
          <li key={k} className="flex items-center gap-2 rounded-control border border-iron bg-obsidian px-3 py-2">
            <span className="w-6 text-center font-display text-gold-300">{i + 1}</span>
            <span className="flex-1 text-ink">{text.get(k)}</span>
            <Button variant="ghost" className="px-3" aria-label={`Move “${text.get(k)}” up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" className="px-3" aria-label={`Move “${text.get(k)}” down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
    );
  }
  const pairs = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {};
  return (
    <div className="space-y-3">
      {item.left.map((l) => (
        <label key={l.key} className="grid gap-1.5 sm:grid-cols-[1fr_1.4fr] sm:items-center sm:gap-3">
          <span className="text-ink">{l.text}</span>
          <select
            value={pairs[l.key] ?? ''}
            onChange={(e) => onChange({ ...pairs, [l.key]: e.target.value })}
            className="min-h-11 rounded-control border border-iron bg-obsidian px-3 text-ink focus-visible:outline-2 focus-visible:outline-gold-300"
          >
            <option value="" disabled>Choose a match…</option>
            {item.right.map((r) => <option key={r.key} value={r.key}>{r.text}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

/** Shows an answer (the player's or the correct one) in words. */
export function describeAnswer(item: IssuedItem, a: Answer | null | undefined): string {
  if (a === null || a === undefined) return 'No answer';
  if (item.kind === 'written') return typeof a === 'string' && a.trim() ? a : 'No answer';
  if (item.kind === 'single_choice') return item.options.find((o) => o.key === a)?.text ?? 'No answer';
  if (item.kind === 'ordering') {
    const text = new Map(item.entries.map((e) => [e.key, e.text] as const));
    return Array.isArray(a) ? a.map((k, i) => `${i + 1}. ${text.get(k) ?? k}`).join('  ') : 'No answer';
  }
  const right = new Map(item.right.map((e) => [e.key, e.text] as const));
  const pairs = typeof a === 'object' && !Array.isArray(a) ? a : {};
  return item.left.map((l) => `${l.text} → ${right.get(pairs[l.key] ?? '') ?? '?'}`).join(';  ');
}
