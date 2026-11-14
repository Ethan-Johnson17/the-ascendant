# The Ascendant

An educational RPG in which **your real-world knowledge is the source of your character's power.**

Current stage: **Phase 0 complete; Phase 1 next.** See `ROADMAP.md` for status.

## Running it on your computer (first time)

You need **Node.js 22.12 or newer** (24 recommended). Check by opening Terminal (Mac) or PowerShell
(Windows) and typing `node -v`.

- **If you use nvm on Windows** (you have several Node versions installed): run `nvm use 24.21.0`
  before working on this project. This switches your default Node for every project, so switch back
  afterwards if another project needs an older version.
- **Otherwise**, install the "LTS" version from https://nodejs.org.

If your Node is too old, `npm install` stops with *"Unsupported engine … Required: node >=22.12"*.
That's deliberate: it prevents confusing errors later.

1. Get the code: `git clone https://github.com/Ethan-Johnson17/the-ascendant.git`, then move into the
   folder with `cd the-ascendant`.
2. Install the project's libraries (only needed once and after updates): `npm install`
3. Run the tests — you should see `pass 15` and `fail 0`: `npm test`
4. Start the app: `npm run dev`, then open http://localhost:5173 in your browser. Stop it with `Ctrl + C`.

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
