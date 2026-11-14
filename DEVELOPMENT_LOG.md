# Development Log

## 2026-11-13 — Phase 0 verified on a real machine; Phase 0 complete

**Environment:** Windows 11, nvm-windows with Node 12/14/18/24 installed; system default was 18.17.
The project needs Node ≥ 22.12 (Vite 7), so all commands ran on Node 24.21 without changing the
system default.

**Results:** install, 15/15 tests, typecheck, build and dev server all pass. Details in `TESTING.md`.

**Problems found and fixed:**
- *Node version not enforced.* On Node 18 the tools fail with unclear errors. Added `.npmrc`
  (`engine-strict=true`), `.nvmrc` (24) and tightened `engines` to `>=22.12` (Vite 7's real minimum).
- *High-severity advisory in zod 3* (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized input).
  Upgraded to zod 4.6.7 and moved `env.ts` to the zod 4 API (`z.url()`; now also requires http/https).
  All tests still pass.
- *npm 11 install-script gate.* npm now asks before running package install scripts. Approved
  `esbuild` (needed by Vite/tsx); recorded in `package.json → allowScripts`.

**Not problems:** typecheck was clean first time; Rollup "comment annotation" warnings come from
inside zod's published files and are harmless; the 660 KB bundle warning will be addressed by
route-level code-splitting in Phase 1.

**Decisions confirmed by the product owner:** phase order follows `MASTER_PROMPT.md`; code lives at
github.com/Ethan-Johnson17/the-ascendant.

**Still open:** schema approval, attribute allocation, race/class/background effects, beta AI provider.

## 2026-11-12 — Phase 0

**Inspected:** No existing repository or code. Design docs (Game Design Document v1.0, CLAUDE.md,
Master Execution Prompt) live in the Claude project.

**Environment constraint:** The build sandbox could not download npm packages. Consequently:
dependency versions in `package.json` are chosen from known releases but have not been installed;
tests ran with Node's built-in runner; UI was compile-checked with esbuild rather than run in Vite.
First real verification happens on the product owner's machine (`npm install && npm test && npm run dev`).

**Decisions made:**
- Engine lives in `src/engine/` as pure TS so Edge Functions can run it authoritatively.
- Node's built-in test runner (via `tsx`) instead of Vitest — one fewer dependency; revisit if UI
  component tests need jsdom.
- Tailwind v4 CSS-first configuration; design tokens in `src/styles/index.css`.
- Level curve `round(base × (level−1)^exponent)`; defaults are tunable placeholders (character: base 100,
  exponent 1.6, max 20 → ~11,100 XP for level 20).
- Following the Master Prompt's phase order where it differs from CLAUDE.md (see ROADMAP).

**Open:** where the code lives (GitHub vs. local folder); AI provider for beta; schema approval;
attribute allocation rules.
