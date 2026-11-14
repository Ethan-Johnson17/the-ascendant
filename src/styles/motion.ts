// Shared motion tokens for Framer Motion, mirroring `--ease-ascend` in index.css.
// Keep animations restrained: short, eased, and respectful of reduced-motion settings.

export const easeAscend = [0.22, 1, 0.36, 1] as const;

export const duration = {
  fast: 0.15,
  base: 0.3,
  slow: 0.6,
  cinematic: 1.2,
} as const;
