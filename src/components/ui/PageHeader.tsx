import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { duration, easeAscend } from '../../styles/motion.ts';
import { Ornament } from './Ornament.tsx';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: easeAscend }}
      className="mb-6 sm:mb-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.3em] text-gold-500">{eyebrow}</p>}
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-wide text-gold-200 sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-2 max-w-2xl font-serif text-lg text-ash">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <Ornament className="mt-5" align="start" />
    </motion.header>
  );
}
