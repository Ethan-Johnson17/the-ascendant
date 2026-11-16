# The Ascendant — AI System

Status: **Phase 4 Milestones A and B built.** The provider layer, limits, usage log, the Tutor, the
Examiner and the Progression Advisor are implemented and tested, and run live with Groq
(`openai/gpt-oss-120b`). Settings are read on every request, so changing a secret needs no redeploy.
Researcher, AI curricula, Game Master and Strategist formats: Milestone C.

## Current setup (Milestone A)

| Setting (Edge Function secret) | Meaning |
|---|---|
| `AI_API_KEY` | The provider key. Without it, AI features say "not set up". |
| `AI_PROVIDER` | `groq` (default), `openai-compatible`, or `fixture` (labelled development answers) |
| `AI_BASE_URL` / `AI_MODEL` | Default `https://api.groq.com/openai/v1` and `openai/gpt-oss-120b` |
| `AI_REASONING_EFFORT` | Default `low` (gpt-oss spends part of its output budget reasoning) |

Code in `src/services/ai/`:
- `types.ts`, `openAiCompatible.ts`, `fixtureProvider.ts`;
- `structured.ts` (schema-checked replies);
- `roles/tutor.ts`, `roles/examiner.ts`, `roles/advisor.ts`;
- `aiService.ts` (Tutor, Advisor), `examinerService.ts` (used by the `learning` function), `usageLog.ts` (shared limits and log);
- `providerFromEnv.ts`;
- `aiClient.ts` (browser).

Limits in `config.ts`: 30 requests per player per rolling 24 hours, 5 per minute, 30 s timeout, one
retry after a timeout or outage, and one repair attempt for a badly formatted reply.

### Tutor
**Input:**
- the lesson's sections, with their certainty labels;
- the Codex entries the lesson introduces;
- the campaign's verified sources, labelled S1, S2...;
- up to three earlier turns, and the question.

Material, earlier turns and the question are wrapped in `<material>`, `<earlier>` and `<question>`
and declared data; closing tags inside them are removed.

**Output:**
- `status`: answered / partly_covered / not_covered / off_topic;
- up to five paragraphs, each with source labels;
- up to three follow-up questions.

Labels are mapped back to source ids; unknown labels are removed and the paragraph is shown as
unsupported. Conversations are not stored.

### Examiner (Milestone B)
Runs inside the `learning` Edge Function when a check with written answers is submitted: one request
per non-blank written answer, all counted against the player's daily limit (checked before any is
spent).

**Input:** the question, the rubric criteria labelled C1, C2... with their points, the model answer
(as one example of a good answer), and the player's answer inside `<answer>`, declared data.

**Output:** for each criterion `met` and a `quote` copied from the answer; `confidence`
(high / medium / low); the main error category or "none"; two or three sentences of feedback.

**Checks before the engine uses it** (`checkJudgement`): every criterion judged exactly once, no
unknown labels, every "met" quote found in the answer (case, punctuation and curly quotes ignored),
and confidence "high". If any check fails, the mark is "not confident" and the engine makes the whole
attempt not count. The engine, not the AI, adds up the points and compares them with the item's pass
points. The judgement (criteria, quotes, confidence, feedback, provider, model) is stored with the
attempt in `assessment_attempts.marking`; the prompt is not.

If the Examiner fails (timeout, outage, garbled reply), nothing is recorded and the player can
submit the same answers again.

### Progression Advisor (Milestone B)
The plan is the engine's (`src/engine/learning/nextSteps.ts`): due reviews, then due Weakness Bank
reviews, then the next lesson, then the check that moves a competency forward; at most three steps.
It shows on the dashboard with no AI. "Explain my plan" sends only the step kinds and activity ids;
the server looks up the curriculum titles (`ai_advisor_context`), so nothing the player typed reaches
the AI. The reply must explain every step exactly once, in order, or it isn't shown. It may not state
subject facts or promise rewards.

## Roles

Six roles with separate interfaces, prompts and output schemas. They may share one model at first.

| Role | Input | Output (schema-validated) | May it change game state? |
|---|---|---|---|
| Game Master | Scene, quest, player message | Narration, NPC dialogue, suggested choices | No |
| Tutor | Objective, codex context, player question | Explanation, examples, cited source IDs | No |
| Examiner | Rubric, player response | Per-criterion scores, misconceptions, error category, confidence | No — produces *evidence* the engine judges |
| Strategist | Curriculum, mastery, weaknesses | Scenario / boss phase drafts | No — drafts validated against content schema |
| Researcher | Topic | Candidate sources with URLs + quoted support | No — sources start `unverified` |
| Progression Advisor | Progress, review schedule | Ranked recommendations | No |

## Provider abstraction

```ts
interface AiProvider {
  id: string;                      // "fixtures" | "ollama" | "gemini" | "openai-compatible" ...
  generate(req: {
    role: AiRole;
    system: string;
    messages: Message[];
    schema?: JsonSchema;           // when structured output is required
    maxOutputTokens: number;
  }): Promise<{ text: string; json?: unknown; usage: Usage; model: string }>;
}
```

Each role is configured as `{ provider, model }` in server config, so Tutor could later use a stronger
model than Game Master without code changes. Providers planned:

- **fixtures** — deterministic, hand-written responses for development and automated tests. The UI marks
  them "Development fixture". Free, offline.
- **ollama** — local open models on your own computer. Free; quality and speed depend on your hardware.
- **openai-compatible** — one adapter covers many hosted services (OpenRouter, Groq, Together, etc.).
- **gemini** — Google's API, which has a free tier (see `COSTS.md` for caveats).

## Pipeline for every call

1. Build context (trimmed: objective, relevant codex entries, recent turns — never the whole history).
2. Call provider with timeout.
3. Parse and validate output with zod. On failure: one repair retry with the validation error, then
   fail safely with a clear message. Never substitute an invented result.
4. Log usage to `ai_requests`; enforce per-user daily budget and per-minute rate limit.
5. Return validated data to the game-action function, which runs the engine.

## Citation integrity

- The AI may only cite sources that exist in the campaign's `sources` table, by ID.
- Citations to unknown IDs are stripped and the claim is flagged as unsupported.
- New sources proposed by the Researcher stay `unverified` until checked: the URL must resolve and the
  quoted passage must be found on the page; academic references are checked against a catalogue
  (e.g. Crossref/OpenLibrary) where possible. Unverified sources are never shown as citations.
- Every lesson claim carries a strength label: established fact, scholarly consensus, competing
  interpretations, disputed, speculation.
- Retrieved text is untrusted: wrapped in delimiters, instructions inside it are ignored.

## Curriculum generation (interface built in Phase 3)

`src/services/curriculum/generator.ts` defines `CurriculumGenerator.propose(request, templateId)`.
`generateCurriculum` validates the learner's request, calls the generator, and accepts the result only
if `validateCurriculum` passes (shape, references, answerable answer keys, cited lessons). Phase 4 adds
an AI-backed generator behind this interface. Today the only implementation is the development
fixture (`src/fixtures/fixtureCurriculumGenerator.ts`), which is marked `origin: 'fixture'` and whose
text says it is placeholder material.
