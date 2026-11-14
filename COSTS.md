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
| **AI — beta** | Real lessons and evaluations for testers | Free tier possible | Hosted free tiers are small and unstable; Google cut Gemini free limits sharply in Dec 2025, and free-tier requests may be used to improve Google's products | A few active testers can exhaust a free daily quota |

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
