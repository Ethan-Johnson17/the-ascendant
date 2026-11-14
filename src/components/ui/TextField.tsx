import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn.ts';

const control =
  'w-full rounded-control border border-iron bg-slate/60 px-3.5 py-3 text-base text-ink placeholder:text-smoke ' +
  'transition-colors focus:border-gold-400 focus:bg-slate focus:outline-none aria-invalid:border-ember';

interface Common {
  label: string;
  hint?: string;
  error?: string | undefined;
  maxLength?: number;
  value: string;
}

function Meta({ id, hint, error, length, maxLength }: { id: string; hint?: string | undefined; error?: string | undefined; length: number; maxLength?: number | undefined }) {
  return (
    <div className="mt-1.5 flex justify-between gap-3 text-xs">
      <p id={id} className={error ? 'text-ember' : 'text-smoke'}>
        {error ?? hint}
      </p>
      {maxLength !== undefined && (
        <p className={cn('tabular-nums', length > maxLength ? 'text-ember' : 'text-smoke')} aria-hidden>
          {length}/{maxLength}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, maxLength, value, className, ...rest }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'maxLength'>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input id={id} value={value} aria-invalid={error ? true : undefined} aria-describedby={`${id}-meta`} className={control} {...rest} />
      <Meta id={`${id}-meta`} hint={hint} error={error} length={value.length} maxLength={maxLength} />
    </div>
  );
}

export function TextArea({ label, hint, error, maxLength, value, className, ...rest }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'maxLength'>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea id={id} value={value} rows={3} aria-invalid={error ? true : undefined} aria-describedby={`${id}-meta`} className={cn(control, 'resize-y font-serif text-lg leading-snug')} {...rest} />
      <Meta id={`${id}-meta`} hint={hint} error={error} length={value.length} maxLength={maxLength} />
    </div>
  );
}
