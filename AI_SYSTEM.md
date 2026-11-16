# The Ascendant — AI System

Status: **Phase 4 Milestone A built.** The provider layer, limits, usage log and the Tutor are
implemented and tested; the `ai` Edge Function is deployed and answering with Groq
(`openai/gpt-oss-120b`). Settings are read on every request, so changing a secret needs no redeploy. Examiner and Progression Advisor: Milestone B. Researcher, AI curricula, Game Master
and Strategist formats: Milestone C.

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
- `roles/tutor.ts`, `aiService.ts`, `providerFromEnv.ts`;
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
