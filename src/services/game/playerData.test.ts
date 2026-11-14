import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { characterInsert, exportPlayer, parsePlayerRows } from './playerData.ts';

const characterRow = {
  id: '6a4c3c9e-0000-4000-8000-000000000001',
  user_id: 'u1',
  name: 'Enheduanna',
  race_id: 'human',
  class_id: 'cleric',
  background_id: 'scholar',
  tincture_id: 'azure',
  appearance_description: 'Ink on her fingers',
  ideals: 'Truth',
  bonds: 'Ur',
  motivation: 'To learn',
  strength: 1,
  dexterity: 1,
  constitution: 2,
  intelligence: 1,
  wisdom: 1,
  charisma: 1,
  total_xp: 10,
  created_at: '2026-11-14T10:00:00.123456+00:00',
  updated_at: '2026-11-14T10:00:00.123456+00:00',
};

const rows = {
  character: characterRow,
  campaigns: [
    {
      id: 'c1',
      template_id: 'history-early-civilizations',
      status: 'paused',
      campaign_xp: 10,
      curriculum_version: 0,
      started_at: '2026-11-14T10:01:00+00:00',
      last_played_at: '2026-11-14T10:02:00+00:00',
    },
  ],
  items: [
    { id: 'i1', item_id: 'quill', source: 'starting_gear', equipped: false, acquired_at: '2026-11-14T10:00:00+00:00', items: { name: 'Quill', description: '' } },
  ],
  achievements: [{ achievement_id: 'character-created', earned_at: '2026-11-14T10:00:00+00:00' }],
};

describe('parsePlayerRows', () => {
  it('maps database rows onto the game’s types', () => {
    const r = parsePlayerRows(rows);
    assert.ok(r.ok);
    const c = r.data.character!;
    assert.equal(c.name, 'Enheduanna');
    assert.deepEqual(c.attributes, { str: 1, dex: 1, con: 2, int: 1, wis: 1, cha: 1 });
    assert.equal(c.createdAt, '2026-11-14T10:00:00.123Z');
    assert.equal(r.data.campaigns[0]!.status, 'paused');
    assert.equal(r.data.items[0]!.name, 'Quill');
    assert.equal(r.data.achievements[0]!.achievementId, 'character-created');
  });

  it('treats a missing character as a new player', () => {
    const r = parsePlayerRows({ character: null, campaigns: [], items: [], achievements: [] });
    assert.ok(r.ok && r.data.character === null);
  });

  it('rejects rows in an unexpected shape instead of guessing', () => {
    const r = parsePlayerRows({ ...rows, character: { ...characterRow, strength: 99 } });
    assert.ok(!r.ok && r.reason.includes('character'));
    const r2 = parsePlayerRows({ ...rows, campaigns: [{ ...rows.campaigns[0], status: 'won' }] });
    assert.ok(!r2.ok && r2.reason.includes('campaigns'));
  });
});

describe('characterInsert', () => {
  it('sends only player-chosen fields, never attributes or XP', () => {
    const parsed = parsePlayerRows(rows);
    assert.ok(parsed.ok);
    const insert = characterInsert(parsed.data.character!);
    assert.deepEqual(Object.keys(insert).sort(), [
      'appearance_description', 'background_id', 'bonds', 'class_id', 'ideals', 'motivation', 'name', 'race_id', 'tincture_id',
    ]);
  });
});

describe('exportPlayer', () => {
  it('produces a labelled, readable JSON copy', () => {
    const parsed = parsePlayerRows(rows);
    assert.ok(parsed.ok);
    const json = JSON.parse(exportPlayer(parsed.data, { email: 'a@example.test', exportedAt: new Date('2026-11-14T12:00:00Z') }));
    assert.equal(json.format, 'the-ascendant-export');
    assert.equal(json.character.name, 'Enheduanna');
    assert.equal(json.account.email, 'a@example.test');
  });
});
