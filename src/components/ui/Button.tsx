import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../utils/cn.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-sans font-medium tracking-wide ' +
  'transition-colors duration-200 select-none disabled:cursor-not-allowed disabled:opacity-45 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gold-300 text-abyss hover:bg-gold-200 active:bg-gold-400 shadow-[0_0_0_1px_var(--color-gold-400),0_8px_24px_-12px_var(--color-gold-500)]',
  secondary: 'border border-gold-500/70 text-gold-200 bg-obsidian hover:bg-charcoal hover:border-gold-400',
  ghost: 'text-ash hover:text-ink hover:bg-slate/60',
  danger: 'border border-ember/70 text-ember bg-obsidian hover:bg-ember/10',
};

// Minimum 44px tap targets on every size (GAME_DESIGN / CLAUDE.md: no tiny mobile controls).
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

/** A navigation link styled as a button. Use for actions that change page. */
export function ButtonLink({ variant = 'primary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
