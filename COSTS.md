# The Ascendant — Services, Free Tiers and Costs

Checked November 2026. Free tiers change often — re-check before beta launch.

## Required now: nothing paid

| Service | Needed for | Cost | Key free-tier limits | When it bites |
|---|---|---|---|---|
| **Node.js** | Running the project on your computer | Free | — | — |
| **GitHub** | Source control, backups of the code | Free | Private repos free | Not for this project |
| **Supabase** (Free plan) | Database, login, file storage, server functions | Free | 2 projects; 500 MB database; 1 GB file storage; 5 GB egress; 50,000 monthly active users; 500,000 Edge Function invocations/month; **projects pause after 7 days of inactivity**; no backups | Pausing during quiet weeks (restorable without data loss); no backups during beta |
| **Hosting** (Vercel / Netlify / Cloudflare Pages free tiers) | Publishing the web app for beta testers | Free | Generous for a static app | Not before thousands of users |
| **AI — development** | Building and testing | Free | Fixture mode needs nothing; Ollama runs on your machine | Local models are slower and weaker than hosted ones |
| **AI — beta: Groq free plan** (chosen 2026-11-16) | Tutor, Examiner, Advisor, Researcher, Course Builder | Free, no card | `openai/gpt-oss-120b`: 30 requests/minute, 1,000/day, 8,000 tokens/minute, **200,000 tokens/day**, shared by every player (Groq rate-limit page, read 2026-11-15). Inputs/outputs not retained by default | Measured 2026-11-16: about 1,700 tokens per Tutor answer, about 3,600 when a repair attempt is needed, so roughly 55–115 answers a day across all players |
| AI — alternatives | Backup providers | Free tiers | Gemini's main free model reported as low as 20 requests/day (third-party reports, 2026); OpenRouter free models about 50/day without credits | Each is a settings change, not a rebuild |
| **Open Library** and **Crossref** APIs | Confirming that books and articles the Researcher suggests exist | Free, no key | Open Library asks for light use; Crossref's public pool is rate-limited per address. At most 6 lookups per search, and each concept can be searched once a week | Only with many players searching at once; a failed lookup just leaves a suggestion unconfirmed |
| **Wikipedia (MediaWiki API)** | Article text the Course Builder writes lessons from | Free, no key | Wikimedia asks for a descriptive User-Agent and modest request rates; we send a generic one and fetch about 1–2 pages per action | Only at large scale; text is CC BY-SA, so lessons credit it |

A Researcher search measured about 700 input and 150–500 output tokens (one request against the
30-a-day allowance).

Course Builder (estimated from its limits, not yet measured): the outline is about 500 input and up
to 2,500 output tokens; a lesson about 3,000 input (the article) and up to 3,500 output; its check
about 1,500 input and up to 2,500 output. So a 4-lesson course is roughly 9 requests and 35,000–
50,000 tokens, a quarter of Groq's free daily total. Building one lesson can briefly use most of the
8,000 tokens-per-minute limit.

Game Master scene, measured 2026-11-16: about 600 input and 300 output tokens. Strategist boss plan:
about 800–1,500 input and 530–630 output tokens. One request each.

Quest story, measured 2026-11-17: about 610 input and 270 output tokens, once per quest.

Boss battle (Phase 5 B1): one Strategist request when a battle starts (same size as the boss plan
above). Answering costs no AI requests. Without AI the game makes its own plan, at no cost.

### Login emails (Supabase Auth)
Supabase's built-in email sender is for testing only: it sends just a handful of emails per hour
and only reliably to the project team's addresses. Sign-up confirmations and password resets for
beta testers need a custom SMTP provider connected in Supabase (several have free tiers of a few
thousand emails a month). **Must be set up before beta.**

## Expected usage (rough, to be measured)

A 20-minute learning session might use ~10–20 AI calls (lesson, questions, evaluations, narration).
Game actions are ~1 Edge Function call each; 500,000/month is far beyond beta needs. Database size
for text-only progress data should stay well under 500 MB for hundreds of testers.

## Where money would eventually be needed

1. **Hosted AI for real users** — the main cost. Priced per token; budget limits per player are built in.
2. **Supabase Pro** (about $25/month) — removes pausing, adds daily backups. Sensible before public beta.
3. **Image generation** for character/battle art — optional; MVP uses reusable illustrations.
4. **Video generation** — explicitly not in MVP.

Each is a configuration change, not a rebuild: the AI layer is provider-agnostic and the database is
standard Postgres.
