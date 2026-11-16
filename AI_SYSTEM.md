# The Ascendant — AI System

Status: **Designed in Phase 0, implemented in Phase 4.** No AI calls exist yet.

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
