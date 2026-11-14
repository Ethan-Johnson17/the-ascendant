# The Ascendant

An educational RPG in which **your real-world knowledge is the source of your character's power.**

Current stage: **Phase 0 — foundation.** See `ROADMAP.md` for status.

## Running it on your computer (first time)

You need **Node.js 22 or newer**. Check by opening Terminal (Mac) or PowerShell (Windows) and typing
`node -v`. If it's missing or older, install the "LTS" version from https://nodejs.org.

1. Unzip the project somewhere you'll keep it, e.g. your Documents folder.
2. Open Terminal and move into the folder, for example:
   `cd ~/Documents/the-ascendant`
3. Install the project's libraries (takes a minute, only needed once and after updates):
   `npm install`
4. Run the tests — you should see `pass 15` and `fail 0`:
   `npm test`
5. Start the app:
   `npm run dev`
   then open http://localhost:5173 in your browser. Stop it with `Ctrl + C`.

Without a database configured, the status screen will show **Configuration: needs attention** —
that's expected until Supabase is set up (Phase 2 will walk you through it).

## Connecting Supabase (when we reach that step)

1. Create a free account at https://supabase.com and a new project.
2. In the project: **Project Settings → API**. Copy the Project URL and the `anon` public key.
3. In the project folder, copy `.env.example` to a new file named `.env.local` and paste the two values.
4. Restart `npm run dev`. The status screen should show **Database: Connected**.

Never paste the `service_role` key or any AI provider key into `.env.local`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development app |
| `npm test` | Run automated tests |
| `npm run typecheck` | Check all code for type errors |
| `npm run build` | Build the production version into `dist/` |

## Documents

`GAME_DESIGN.md` (product authority) · `CLAUDE.md` (development instructions) · `ARCHITECTURE.md` ·
`DATABASE_SCHEMA.md` · `AI_SYSTEM.md` · `COSTS.md` · `ROADMAP.md` · `TESTING.md` · `CHANGELOG.md` ·
`DEVELOPMENT_LOG.md`
