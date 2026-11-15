# The Ascendant

An educational RPG in which **your real-world knowledge is the source of your character's power.**

Current stage: **Phase 1, application foundation.** See `ROADMAP.md` for status.

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
3. Run the tests — you should see `fail 0`: `npm test`
4. Start the app: `npm run dev`, then open http://localhost:5173 in your browser. Stop it with `Ctrl + C`.

You'll see the welcome screen. Create an account (or sign in), then create your character. Choose
**Preview with a sample adventurer** to see the app with progress on screen without an account.
The app needs a Supabase project to sign in — see below.

## Connecting Supabase

1. Create a free account at https://supabase.com and a new project. Keep the database password private.
2. **Project Settings → API Keys**: copy the **publishable** key (`sb_publishable_…`). The Project URL
   is `https://<project-ref>.supabase.co` — nothing after `.co`.
3. In the project folder, copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. **Authentication → URL Configuration**: Site URL `http://localhost:5173`; add the redirect URL
   `http://localhost:5173/**`. (Without this, confirmation emails link to the wrong address.)
5. Put the database in place (run in the project folder):
   - `npx supabase login` — opens the browser to sign in.
   - `npx supabase link --project-ref <project-ref>`
   - `npx supabase db push --remote` — **`--remote` is required** with Supabase CLI 3, which otherwise
     targets a local database. Add `--yes` if the Yes/No prompt doesn't respond to arrow keys.
6. Deploy the server function that marks checks and records lessons:
   `npx supabase functions deploy learning --use-api --yes`. (`--use-api` builds it on Supabase's
   servers, so Docker isn't needed. Supabase supplies the function's server key itself; nothing to paste.)
7. Restart `npm run dev`. **Settings → System status** should show **Database: Connected**.

Never paste the secret (`sb_secret_…`) or `service_role` key, or any AI provider key, into `.env.local`.
The app refuses a secret key if one is pasted by mistake.

Supabase's built-in email sender only sends a few emails an hour. Connect a custom SMTP provider before
inviting beta testers (see `COSTS.md`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development app |
| `npm test` | Run automated tests |
| `npm run typecheck` | Check all code for type errors |
| `npm run build` | Build the production version into `dist/` |
| `npm run content:sql` | After editing lessons in `src/content/curricula/`, rewrite their migration (then bump the curriculum version and `db push`) |

## Documents

`GAME_DESIGN.md` (product authority) · `CLAUDE.md` (development instructions) · `ARCHITECTURE.md` ·
`DATABASE_SCHEMA.md` · `AI_SYSTEM.md` · `COSTS.md` · `ROADMAP.md` · `TESTING.md` · `CHANGELOG.md` ·
`DEVELOPMENT_LOG.md`
