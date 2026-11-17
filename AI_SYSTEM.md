# The Ascendant — AI System

Status: **Phase 4 built (Milestones A, B and C).** The provider layer, limits, usage log and all seven
roles (Tutor, Examiner, Progression Advisor, Researcher, Course Builder, Game Master, Strategist) are
implemented and tested, and run live with Groq (`openai/gpt-oss-120b`). The Game Master and the
Strategist have no screens yet: quests and bosses use them in Phase 5. Settings are read on every
request, so changing a secret needs no redeploy.

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

### Researcher (Milestone C part 1)
"Find further reading" on an unlocked Codex entry. One AI request per search, and at most one search
per concept every 7 days (`researchCooldownDays`). The Researcher sees only the curriculum's concept
title and summary, the course title and the sources the course already cites; nothing the player
typed. It has no web access, so its suggestions are only candidates (up to 6).

Our own code then checks each one (`src/services/research/`, no AI involved):

| Kind | Checks (all must pass) |
|---|---|
| Book | Found in **Open Library** with a matching title (and the author's surname, if given) |
| Journal article | Found in **Crossref** with a matching title: by DOI if given (a real DOI for a different work fails), else by search |
| Web page | On the trusted-publisher list (museums, universities, governments, libraries, academic publishers, major encyclopedias); the page loads; its title matches; its body mentions the concept |

Only verified results are shown, as "Further reading", never as lesson citations. The rest are stored
as `unverified` and only counted ("3 other suggestions couldn't be confirmed and were hidden"). The
check proves a work exists, not what it says, so the AI's one-line description is labelled
"Researcher's note (not checked)".

Fetching is server-side and guarded (`safeFetch.ts`): https only, no IP addresses, internal host
names, credentials or unusual ports; every redirect is re-checked (at most 3); 8-second timeout;
2 MB limit; a generic User-Agent; only titles, author names and DOIs are sent to the catalogues.
Known limitation: an Edge Function can't see which IP address a name resolves to, so a public name
that points at a private address can't be detected. Edge Functions run outside our network, which
limits the harm.

First live results (2026-11-16, three searches): the AI invented web addresses, a DOI and a book
title; every one was caught. With books and articles preferred in the prompt, a real book (Kramer,
*The Sumerians*) was confirmed and shown. Expect many searches to show little or nothing.

### Course Builder (Milestone C part 2)
"Start a new subject" on the Campaigns screen. The player gives a subject, a goal and a level.

1. **Topic check (no AI).** `src/services/subjects/topicGuard.ts` refuses clearly harmful requests
   (making weapons, drugs or malware; self-harm methods; sexual content; hate). Serious subjects that
   only mention hard topics are allowed. Health, law and money courses are marked "for learning, not
   personal advice". A refusal uses no AI request.
2. **Slots.** At most 3 open AI subjects per player (`config.courseBuilder.maxOpenSubjects`).
3. **Outline (1 request).** Title, description, 6 sub-skills, 2–3 competencies (each mapped to an
   attribute) and exactly 4 lessons, each with a suggested Wikipedia article. The player's words sit
   inside `<request>` delimiters and are treated as data.
4. **Articles (no AI).** For each lesson the server looks up the suggested article on English
   Wikipedia (MediaWiki API through `safeFetch`; redirects followed; missing and disambiguation pages
   rejected), falling back to a search. No article → the course is refused before saving.
5. **Each lesson, built when the player reaches it (2 requests).** The server fetches the article text
   (up to 9,000 characters, reference sections removed) and asks for 3–5 sections, each of 2–3
   paragraphs in the AI's own words plus one **word-for-word quote** from the article, and 2–4 Codex
   concepts, each with a quote. Our code drops any section or concept whose quote is not in the
   article (`quoteIndex`, whole words, at least 15 characters) and any section that only repeats its
   quote. Then a second request writes 3–5 multiple-choice questions and one written question; each
   question carries a `support` quote that must appear in the lesson text, and broken questions are
   dropped (duplicate options, "all of the above", answers out of range).
6. **Engine and database decide.** Keys are made by our code, not the AI. The lesson is turned into a
   normal curriculum and must pass `validateCurriculum`; the engine sets the check's target stage
   (lessons 1–2 → Apprentice, 3–4 → Competent). A service-role function saves it, checking ids and
   order. After that it is an ordinary lesson: same XP, mastery and Codex rules.

Lessons must be built in order; the previous lesson must be completed first. Building needs 2 free
requests from the player's 30 a day. If too little survives the checks, nothing is saved and the
player can try again.

Labels: every AI-made lesson shows "AI-generated, not reviewed by a person", its quoted source line,
"Wikipedia, an encyclopedia, not an academic or primary source" and the CC BY-SA notice. Fixture
courses say "Development fixture". "Report a mistake" saves the report and flags the lesson.

Known limits: the quote check proves the evidence is real, not that the AI's paraphrase is right, and
answer keys come from the AI (backed only by the support quote). Competency mapping can be odd. A
lesson can't be rebuilt yet. Groq's 8,000 tokens-per-minute limit means two players building at once
may have to wait.

### Game Master (Milestone C part 3; no screen until Phase 5)
Action `narrate_scene`. The game supplies the scene: its title, purpose, characters (by id) and the
only actions the player may take next. Until quests exist, the server uses one preview scene ("The
guide at the gate"). The AI sees the campaign, the player's character (name, race and class inside
`<story>`) and the player's message inside `<player>` (300 characters, last 2 turns). It replies with
1–3 paragraphs of narration, lines for known characters, and a label for each offered action.

Our code (`checkScene`) removes any line that claims a game result (XP, levels, marks, mastery,
rewards, winning or losing, "the answer is"), lines from unknown characters and invented actions. If
no narration is left, or an offered action has no label, nothing is shown. Choices always appear in
the game's order. The Game Master changes nothing and nothing is saved.

### Strategist (Milestone C part 3; no screen until Phase 5)
Action `plan_boss`. Decided 2026-11-16: a boss uses only the course's existing, already-checked
questions. The engine (`src/engine/encounters/bossPlan.ts`) owns the rules:
- difficulty follows the player's mastery stage per competency: stages 1–2 → difficulty 1–2,
  stage 3 → 1–3, stages 4+ → 2–3;
- 3 to 5 rounds, 1 to 3 questions each, at most 12 in all, no question twice, every tested
  competency at least once; multiple-choice, ordering and matching only (written answers wait for
  Phase 5);
- the engine picks which competencies are tested (those it can ask about, up to 5) and checks a fair
  boss is possible before any AI request ("not ready" costs nothing).

The Strategist sees only the allowed questions' prompts, concept and difficulty, numbered Q1, Q2 …,
never their options, answers or database ids. It replies with a name, epithet, introduction, rounds
(by C and Q number) and victory and defeat text (shown only after the engine decides, in Phase 5).
Our code translates the numbers to ids and runs `checkBossPlan`; any problem means nothing is used,
and the problem codes are logged (e.g. `plan: round_count`). Story lines that claim results are
removed. The reply carries question ids only.

Known limit: the story text isn't fact-checked; it can echo the topic of its questions. In Phase 5
it is shown as flavour around the checked questions, which remain the only thing marked.

### Repair reasons
When a reply fails its format check and gets its one repair attempt, `ai_requests.repair_reason`
records why, as field paths and check codes only (for example `sources.0.why: too_small`, `not_json`,
`provider_rejected_format`). It never contains reply text.

## Roles

Seven roles with separate interfaces, prompts and output schemas. They may share one model at first.

| Role | Input | Output (schema-validated) | May it change game state? |
|---|---|---|---|
| Game Master | Scene (from the game), player message | Narration, lines for known characters, labels for the game's actions | No — outcome claims, unknown characters and invented actions removed |
| Tutor | Objective, codex context, player question | Explanation, examples, cited source IDs | No |
| Examiner | Rubric, player response | Per-criterion scores, misconceptions, error category, confidence | No — produces *evidence* the engine judges |
| Strategist | Allowed checked questions (prompts only), competencies | Boss story and rounds by question number | No — the engine checks every plan against its rules |
| Researcher | Concept title and summary | Candidate books, articles and pages | No — our code checks every suggestion; unconfirmed ones are never shown |
| Progression Advisor | Progress, review schedule | Ranked recommendations | No |
| Course Builder | Player's subject and goal; fetched article text | Outline; lesson sections and concepts with quotes; check questions | No — quotes checked by our code, lessons validated by the engine and saved by a server function |

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
- Sources proposed by the Researcher stay `unverified` until checked (see "Researcher" above):
  books against Open Library, articles against Crossref, web pages for a trusted publisher, a
  loading page, a matching title and on-topic text. Unverified sources are never shown. Verified ones
  are further reading only, not lesson citations. (The plan said the page must contain a quoted
  claim; the Researcher can't browse, so it has no real quotes to give. That check arrived in C2:
  AI-made lessons quote the fetched article word for word, and our code checks every quote.)
- Every lesson claim carries a strength label: established fact, scholarly consensus, competing
  interpretations, disputed, speculation.
- Retrieved text is untrusted: wrapped in delimiters, instructions inside it are ignored.

## Curriculum generation (interface built in Phase 3)

`src/services/curriculum/generator.ts` defines `CurriculumGenerator.propose(request, templateId)`.
`generateCurriculum` validates the learner's request, calls the generator, and accepts the result only
if `validateCurriculum` passes (shape, references, answerable answer keys, cited lessons). AI-made subjects (C2)
don't use this interface: they are built one lesson at a time by the Course Builder (above), and each
lesson goes through the same `validateCurriculum`. Today the only implementation is the development
fixture (`src/fixtures/fixtureCurriculumGenerator.ts`), which is marked `origin: 'fixture'` and whose
text says it is placeholder material.
