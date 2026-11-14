import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Offline test database: PGlite (real Postgres in WebAssembly) + a Supabase stand-in + the real
 * migration files, applied in order. Lets the security rules be tested without Docker or network.
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

export type Role = 'anon' | 'authenticated' | 'service_role';

export interface TestDb {
  db: PGlite;
  /** Creates an account the way Supabase Auth would (as the database owner). */
  createUser(email?: string): Promise<string>;
  /** Runs `fn` as a signed-in player, inside a transaction that is always rolled back on error. */
  asUser<T>(userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  asRole<T>(role: Role, fn: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Runs `fn` as the player and returns the Postgres error message, or null if it succeeded. */
  errorAsUser(userId: string, sql: string, params?: unknown[]): Promise<string | null>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const run = async <T>(role: Role, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });

  return {
    db,
    async createUser(email = `player-${Math.random().toString(36).slice(2)}@example.test`) {
      const res = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
      const id = res.rows[0]?.id;
      if (!id) throw new Error('user not created');
      return id;
    },
    asUser: (userId, fn) => run('authenticated', userId, fn),
    asRole: (role, fn) => run(role, null, fn),
    async errorAsUser(userId, sql, params = []) {
      try {
        await run('authenticated', userId, (tx) => tx.query(sql, params));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  };
}

export const PILOT = 'history-early-civilizations';

/** Inserts a valid character for the player, as the player would. */
export async function createCharacterAs(t: TestDb, userId: string, name = 'Enheduanna', backgroundId = 'scholar') {
  return t.asUser(userId, async (tx) => {
    const res = await tx.query<{ id: string }>(
      `insert into public.characters (name, race_id, class_id, background_id, tincture_id)
       values ($1, 'human', 'cleric', $2, 'azure') returning id`,
      [name, backgroundId],
    );
    return res.rows[0]!.id;
  });
}

export async function startCampaignAs(t: TestDb, userId: string, templateId = PILOT) {
  return t.asUser(userId, async (tx) => {
    const res = await tx.query<{ id: string }>(`insert into public.campaigns (template_id) values ($1) returning id`, [templateId]);
    return res.rows[0]!.id;
  });
}
