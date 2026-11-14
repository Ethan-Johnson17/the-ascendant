import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, PILOT, startCampaignAs, type TestDb } from './testDb.ts';
import { planXpAward } from '../../src/engine/progression/xpAward.ts';

/**
 * Proves the database's security rules (CLAUDE.md Part 19):
 *   - user records cannot be accessed by other users
 *   - players cannot edit engine-owned values (XP, attributes, mastery, completion)
 *   - XP cannot be awarded twice; campaign XP is isolated per campaign
 */

let t: TestDb;
before(async () => {
  t = await createTestDb();
});

const award = (t: TestDb, userId: string, campaignId: string | null, kind: Parameters<typeof planXpAward>[0]['kind'], sourceId: string) => {
  const p = planXpAward({ kind, sourceId, campaignId });
  return t.asRole('service_role', async (tx) => {
    const r = await tx.query<{ applied: boolean }>(
      'select public.apply_xp_award($1, $2, $3, $4, $5, $6, $7) as applied',
      [userId, p.campaignId, p.kind, p.sourceId, p.amount, p.idempotencyKey, p.configVersion],
    );
    return r.rows[0]!.applied;
  });
};

describe('accounts and characters', () => {
  it('creates a profile for every new account', async () => {
    const u = await t.createUser();
    const rows = await t.asUser(u, (tx) => tx.query('select user_id from public.profiles'));
    assert.equal(rows.rows.length, 1);
  });

  it('creates a character with every attribute at 1, zero XP, starting gear and an achievement', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u, 'Enheduanna', 'scholar');
    const { rows } = await t.asUser(u, (tx) =>
      tx.query<Record<string, number>>('select strength, dexterity, constitution, intelligence, wisdom, charisma, total_xp from public.characters'),
    );
    assert.deepEqual(rows[0], { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1, total_xp: 0 });
    const items = await t.asUser(u, (tx) => tx.query<{ item_id: string }>('select item_id from public.character_items order by item_id'));
    assert.deepEqual(items.rows.map((r) => r.item_id), ['quill', 'wax-tablet']);
    const ach = await t.asUser(u, (tx) => tx.query<{ achievement_id: string }>('select achievement_id from public.player_achievements'));
    assert.deepEqual(ach.rows.map((r) => r.achievement_id), ['character-created']);
  });

  it('refuses attributes or XP supplied by the player', async () => {
    const u = await t.createUser();
    const err = await t.errorAsUser(
      u,
      `insert into public.characters (name, race_id, class_id, background_id, tincture_id, intelligence, total_xp)
       values ('Cheater', 'elf', 'wizard', 'scholar', 'or', 20, 99999)`,
    );
    assert.match(err ?? '', /permission denied/);
  });

  it('refuses a character for someone else', async () => {
    const u = await t.createUser();
    const victim = await t.createUser();
    const err = await t.errorAsUser(
      u,
      `insert into public.characters (user_id, name, race_id, class_id, background_id, tincture_id)
       values ($1, 'Impostor', 'elf', 'wizard', 'scholar', 'or')`,
      [victim],
    );
    assert.match(err ?? '', /permission denied/);
  });

  it('allows only one character per player', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    const err = await t.errorAsUser(u, `insert into public.characters (name, race_id, class_id, background_id, tincture_id) values ('Second', 'elf', 'wizard', 'scholar', 'or')`);
    assert.match(err ?? '', /duplicate key|unique/);
  });

  it('rejects unknown races and malformed names', async () => {
    const u = await t.createUser();
    const bad = (name: string, race: string) =>
      t.errorAsUser(u, `insert into public.characters (name, race_id, class_id, background_id, tincture_id) values ($1, $2, 'wizard', 'scholar', 'or')`, [name, race]);
    assert.ok(await bad('Valid Name', 'dragon'));
    assert.ok(await bad(' padded ', 'elf'));
    assert.ok(await bad('x', 'elf'));
    assert.ok(await bad('double  space', 'elf'));
  });

  it('lets players rename themselves but never edit attributes or XP', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    assert.equal(await t.errorAsUser(u, `update public.characters set name = 'Renamed'`), null);
    assert.match((await t.errorAsUser(u, `update public.characters set intelligence = 20`)) ?? '', /permission denied/);
    assert.match((await t.errorAsUser(u, `update public.characters set total_xp = 5000`)) ?? '', /permission denied/);
  });
});

describe('data isolation between players', () => {
  it('one player cannot see or change another player’s records', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await createCharacterAs(t, a, 'Alpha');
    const campaign = await startCampaignAs(t, a);
    await award(t, a, campaign, 'lesson_completed', 'activity-1');

    for (const table of ['profiles', 'characters', 'campaigns', 'competency_progress', 'xp_transactions', 'player_achievements', 'character_items']) {
      const { rows } = await t.asUser(b, (tx) => tx.query(`select * from public.${table}`));
      // B has a profile of their own; everything else of A's must be invisible.
      const foreign = rows.filter((r) => (r as { user_id?: string }).user_id === a);
      assert.equal(foreign.length, 0, `${table} leaked`);
    }
    const renamed = await t.asUser(b, (tx) => tx.query(`update public.characters set name = 'Hacked' where user_id = $1 returning id`, [a]));
    assert.equal(renamed.rows.length, 0);
    const paused = await t.asUser(b, (tx) => tx.query(`update public.campaigns set status = 'paused' where id = $1 returning id`, [campaign]));
    assert.equal(paused.rows.length, 0);
  });

  it('signed-out visitors see content but no player data', async () => {
    const a = await t.createUser();
    await createCharacterAs(t, a, 'Visible Not');
    const races = await t.asRole('anon', (tx) => tx.query('select id from public.races'));
    assert.equal(races.rows.length, 4);
    let err: string | null = null;
    try {
      await t.asRole('anon', (tx) => tx.query('select * from public.characters'));
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    assert.match(err ?? '', /permission denied/);
  });
});

describe('campaigns', () => {
  it('starts a campaign with Novice progress for every competency and an achievement', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    const id = await startCampaignAs(t, u);
    const progress = await t.asUser(u, (tx) => tx.query<{ mastery_stage: number }>('select mastery_stage from public.competency_progress where campaign_id = $1', [id]));
    assert.equal(progress.rows.length, 10);
    assert.ok(progress.rows.every((r) => r.mastery_stage === 1));
    const ach = await t.asUser(u, (tx) => tx.query('select 1 from public.player_achievements where achievement_id = $1', ['first-campaign']));
    assert.equal(ach.rows.length, 1);
  });

  it('cannot be started twice, pauses and resumes, and cannot be completed or given XP by the player', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    const id = await startCampaignAs(t, u);
    assert.match((await t.errorAsUser(u, `insert into public.campaigns (template_id) values ($1)`, [PILOT])) ?? '', /duplicate key|unique/);
    assert.equal(await t.errorAsUser(u, `update public.campaigns set status = 'paused' where id = $1`, [id]), null);
    assert.equal(await t.errorAsUser(u, `update public.campaigns set status = 'active' where id = $1`, [id]), null);
    assert.match((await t.errorAsUser(u, `update public.campaigns set status = 'completed' where id = $1`, [id])) ?? '', /granted by the game engine/);
    assert.match((await t.errorAsUser(u, `update public.campaigns set campaign_xp = 999 where id = $1`, [id])) ?? '', /permission denied/);
  });

  it('players cannot change their own mastery', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    await startCampaignAs(t, u);
    assert.match((await t.errorAsUser(u, `update public.competency_progress set mastery_stage = 6`)) ?? '', /permission denied/);
  });

  it('refuses another player’s private campaign template', async () => {
    const owner = await t.createUser();
    const other = await t.createUser();
    await t.db.query(
      `insert into public.campaign_templates (id, subject, title, module, owner_user_id) values ('private-econ', 'Economics', 'Private', 'Module', $1)`,
      [owner],
    );
    await createCharacterAs(t, other);
    assert.match((await t.errorAsUser(other, `insert into public.campaigns (template_id) values ('private-econ')`)) ?? '', /not available/);
  });
});

describe('XP ledger', () => {
  it('players cannot award themselves XP or write to the ledger', async () => {
    const u = await t.createUser();
    const c = await createCharacterAs(t, u);
    assert.match(
      (await t.errorAsUser(u, `select public.apply_xp_award($1, null, 'boss_defeated', 'x', 200, 'k', 'v')`, [u])) ?? '',
      /permission denied/,
    );
    assert.match(
      (await t.errorAsUser(
        u,
        `insert into public.xp_transactions (user_id, character_id, amount, kind, source_id, idempotency_key, config_version) values ($1, $2, 500, 'boss_defeated', 'x', 'k', 'v')`,
        [u, c],
      )) ?? '',
      /permission denied/,
    );
  });

  it('XP cannot be awarded twice for the same completed activity', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    const campaign = await startCampaignAs(t, u);
    assert.equal(await award(t, u, campaign, 'lesson_completed', 'lesson-42'), true);
    assert.equal(await award(t, u, campaign, 'lesson_completed', 'lesson-42'), false);
    const { rows } = await t.asUser(u, (tx) => tx.query<{ n: number; total: number }>('select count(*)::int as n, sum(amount)::int as total from public.xp_transactions'));
    assert.deepEqual(rows[0], { n: 1, total: 10 });
    const ch = await t.asUser(u, (tx) => tx.query<{ total_xp: number }>('select total_xp from public.characters'));
    assert.equal(ch.rows[0]!.total_xp, 10);
  });

  it('keeps campaign XP isolated while character XP is the sum of the ledger', async () => {
    const u = await t.createUser();
    await createCharacterAs(t, u);
    await t.db.query(`insert into public.campaign_templates (id, subject, title, module) values ('test-econ', 'Economics', 'Test', 'Module') on conflict do nothing`);
    const history = await startCampaignAs(t, u, PILOT);
    const econ = await startCampaignAs(t, u, 'test-econ');
    await award(t, u, history, 'quest_completed', 'quest-1');
    await award(t, u, history, 'lesson_completed', 'lesson-1');
    await award(t, u, econ, 'lesson_completed', 'lesson-1-econ');
    const camps = await t.asUser(u, (tx) => tx.query<{ template_id: string; campaign_xp: number }>('select template_id, campaign_xp from public.campaigns order by template_id'));
    assert.deepEqual(camps.rows, [
      { template_id: PILOT, campaign_xp: 50 },
      { template_id: 'test-econ', campaign_xp: 10 },
    ]);
    const ch = await t.asUser(u, (tx) => tx.query<{ total_xp: number }>('select total_xp from public.characters'));
    assert.equal(ch.rows[0]!.total_xp, 60);
  });

  it('refuses to credit XP to another player’s campaign', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await createCharacterAs(t, a);
    await createCharacterAs(t, b);
    const bCampaign = await startCampaignAs(t, b);
    await assert.rejects(() => award(t, a, bCampaign, 'lesson_completed', 'steal'), /does not belong/);
  });
});

describe('delete my progress', () => {
  it('removes only the caller’s character and progress', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await createCharacterAs(t, a);
    await createCharacterAs(t, b);
    const ca = await startCampaignAs(t, a);
    await startCampaignAs(t, b);
    await award(t, a, ca, 'lesson_completed', 'l1');
    await t.asUser(a, (tx) => tx.query('select public.delete_my_progress()'));
    for (const table of ['characters', 'campaigns', 'competency_progress', 'xp_transactions', 'player_achievements', 'character_items']) {
      const mine = await t.asUser(a, (tx) => tx.query(`select 1 from public.${table}`));
      assert.equal(mine.rows.length, 0, `${table} not cleared`);
    }
    const theirs = await t.asUser(b, (tx) => tx.query('select 1 from public.characters'));
    assert.equal(theirs.rows.length, 1);
  });
});
