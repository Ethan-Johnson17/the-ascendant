import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterAs, createTestDb, serviceStore, startCampaignAs, type TestDb } from './testDb.ts';
import { createAiService } from '../../src/services/ai/aiService.ts';
import { createDevelopmentFixtures } from '../../src/services/ai/providerFromEnv.ts';
import type { AiProvider, AiRequest } from '../../src/services/ai/types.ts';
import { createLearningService } from '../../src/services/learning/learningService.ts';

/**
 * Talk with characters end to end on the real migrations and Mesopotamia content: story only, facts
 * only from unlocked Codex entries, saved conversations (last 20), and privacy.
 */

const PILOT = 'history-early-civilizations';
const LESSON = `${PILOT}/lesson-land-between-rivers`;

let t: TestDb;
before(async () => {
  t = await createTestDb();
});

async function newPlayer() {
  const u = await t.createUser();
  await createCharacterAs(t, u);
  return { u, campaignId: await startCampaignAs(t, u) };
}

function serviceWith(provider: AiProvider | null) {
  // Real time, five minutes apart per call, so the per-minute limit stays out of the way.
  let now = Date.now();
  return createAiService(serviceStore(t), provider, { now: () => new Date((now += 5 * 60_000)), sleep: async () => {} });
}

/** A scripted AI that records what it was sent. */
function scripted(reply: unknown) {
  const seen: AiRequest[] = [];
  const provider: AiProvider = {
    id: 'scripted', model: 'm', origin: 'ai',
    generate: async (req: AiRequest) => {
      seen.push(req);
      return { text: JSON.stringify(reply), usage: { inputTokens: 1, outputTokens: 1 }, model: 'm', provider: 'scripted', origin: 'ai' };
    },
  };
  return { provider, seen };
}

const talk = (svc: ReturnType<typeof serviceWith>, u: string, campaignId: string, message = 'Hello! What is this place?', characterId = 'guide') =>
  svc.handle(u, { action: 'talk', campaignId, characterId, message });
const saved = (u: string, campaignId: string, characterId = 'guide') =>
  t.asUser(u, async (tx) => (await tx.query<{ speaker: string; body: string; origin: string | null; suggestions: string[] }>(
    'select speaker, body, origin, suggestions from public.talk_messages where campaign_id = $1 and character_id = $2 order by id', [campaignId, characterId])).rows);
const xp = (u: string) => t.asUser(u, async (tx) => (await tx.query<{ n: number }>('select count(*)::int as n from public.xp_transactions')).rows[0]!.n);

describe('Talk with characters (database + service)', () => {
  it('saves a labelled fixture exchange, with only the game’s own suggestions, and changes no progress', async () => {
    const { u, campaignId } = await newPlayer();
    const r = await talk(serviceWith(createDevelopmentFixtures()), u, campaignId);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const body = r.body as { origin: string; reply: { lines: string[]; suggestions: string[] }; nextLesson: { key: string } | null };
    assert.equal(body.origin, 'fixture');
    assert.deepEqual(body.reply.suggestions, ['next_lesson']);
    assert.equal(body.nextLesson?.key, 'lesson-land-between-rivers', 'the first lesson of the course');
    const rows = await saved(u, campaignId);
    assert.deepEqual(rows.map((m) => [m.speaker, m.origin]), [['player', null], ['character', 'fixture']]);
    assert.match(rows[1]!.body, /Development fixture/);
    assert.equal(await xp(u), 0, 'story only');
  });

  it('gives the character only the Codex entries the player has unlocked, and the latest messages', async () => {
    const { u, campaignId } = await newPlayer();
    const ai = scripted({ lines: ['The rivers bring life to this dry land.'], suggest: ['quests'] });
    const svc = serviceWith(ai.provider);
    await talk(svc, u, campaignId, 'Tell me about the land.');
    assert.match(ai.seen[0]!.messages[1]!.content, /\(nothing yet/, 'no lesson finished, so no facts');

    await createLearningService(serviceStore(t)).handle(u, { action: 'complete_lesson', campaignId, activityId: LESSON });
    await talk(svc, u, campaignId, 'And now?');
    const user = ai.seen[1]!.messages[1]!.content;
    assert.match(user, /<known>\n- /, 'the lesson’s Codex entries are now known');
    assert.doesNotMatch(user, /Ubaid/, 'entries from lessons not yet read are not');
    assert.match(user, /<player>Tell me about the land\.<\/player>/, 'the earlier message is sent back');
    assert.match(user, /The Guide said: The rivers bring life/);
  });

  it('talks only with the course’s characters; the scribe exists in Mesopotamia', async () => {
    const { u, campaignId } = await newPlayer();
    const svc = serviceWith(createDevelopmentFixtures());
    assert.equal((await talk(svc, u, campaignId, 'Hi', 'pharaoh')).status, 404);
    assert.equal((await talk(svc, u, campaignId, 'Hi', 'scribe-of-uruk')).status, 200);
    assert.equal((await saved(u, campaignId, 'scribe-of-uruk')).length, 2);
    assert.equal((await saved(u, campaignId, 'guide')).length, 0, 'each character has its own conversation');
  });

  it('saves nothing when the reply claims an outcome', async () => {
    const { u, campaignId } = await newPlayer();
    const r = await talk(serviceWith(scripted({ lines: ['You have earned 100 XP, hero!'], suggest: [] }).provider), u, campaignId);
    assert.notEqual(r.status, 200);
    assert.equal((await saved(u, campaignId)).length, 0);
  });

  it('keeps the last 20 messages per character', async () => {
    const { u, campaignId } = await newPlayer();
    const svc = serviceWith(createDevelopmentFixtures());
    for (let i = 1; i <= 11; i++) assert.equal((await talk(svc, u, campaignId, `Message ${i}`)).status, 200);
    const rows = await saved(u, campaignId);
    assert.equal(rows.length, 20);
    assert.equal(rows[0]!.body, 'Message 2', 'the oldest exchange was dropped');
  });

  it('is private: players read and clear only their own, and cannot write messages', async () => {
    const { u, campaignId } = await newPlayer();
    await talk(serviceWith(createDevelopmentFixtures()), u, campaignId);
    const other = await newPlayer();
    assert.equal((await saved(other.u, campaignId)).length, 0, 'another player sees nothing');
    assert.ok(await t.errorAsUser(u, `insert into public.talk_messages (campaign_id, user_id, character_id, speaker, body) values ($1, $2, 'guide', 'character', 'You win!')`, [campaignId, u]));
    assert.ok(await t.errorAsUser(u, `select public.ai_save_talk($1, $2, 'guide', '{}'::jsonb, 20)`, [u, campaignId]));
    assert.ok(await t.errorAsUser(u, `select public.ai_talk_context($1, $2, 'guide', 6)`, [u, campaignId]));
    await t.asUser(other.u, (tx) => tx.query('delete from public.talk_messages'));
    assert.equal((await saved(u, campaignId)).length, 2, 'another player cannot clear it');
    await t.asUser(u, (tx) => tx.query('delete from public.talk_messages where campaign_id = $1', [campaignId]));
    assert.equal((await saved(u, campaignId)).length, 0, 'the player can clear their own');
  });
});
