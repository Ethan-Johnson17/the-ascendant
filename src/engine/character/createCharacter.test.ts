import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, normaliseName, type CharacterCatalog, type CharacterDraft } from './createCharacter.ts';
import { attributeIds, defaultCharacterRules, isUntested } from './attributes.ts';

const catalog: CharacterCatalog = {
  raceIds: ['human', 'elf', 'dwarf', 'halfling'],
  classIds: ['fighter', 'ranger', 'rogue', 'wizard', 'cleric'],
  backgroundIds: ['soldier', 'scholar', 'merchant', 'artisan', 'explorer'],
  tinctureIds: ['or', 'azure'],
};

const draft = (over: Partial<CharacterDraft> = {}): CharacterDraft => ({
  name: 'Enheduanna',
  raceId: 'human',
  classId: 'cleric',
  backgroundId: 'scholar',
  appearance: { tinctureId: 'or', description: '' },
  personality: { ideals: '', bonds: '', motivation: '' },
  ...over,
});

const ctx = { id: 'c1', now: new Date('2026-11-13T12:00:00Z'), catalog };

describe('createCharacter', () => {
  it('starts every attribute at 1 and XP at 0', () => {
    const result = createCharacter(draft(), ctx);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const id of attributeIds) assert.equal(result.character.attributes[id], 1, id);
    assert.equal(result.character.totalXp, 0);
    assert.equal(result.character.createdAt, '2026-11-13T12:00:00.000Z');
  });

  it('gives identical attributes for every race, class and background combination', () => {
    const first = createCharacter(draft(), ctx);
    assert.ok(first.ok);
    const baseline = JSON.stringify(first.character.attributes);
    for (const raceId of catalog.raceIds)
      for (const classId of catalog.classIds)
        for (const backgroundId of catalog.backgroundIds) {
          const r = createCharacter(draft({ raceId, classId, backgroundId }), ctx);
          assert.ok(r.ok);
          if (r.ok) assert.equal(JSON.stringify(r.character.attributes), baseline, `${raceId}/${classId}/${backgroundId}`);
        }
  });

  it('rejects unknown race, class, background and crest colour', () => {
    const r = createCharacter(
      draft({ raceId: 'dragon', classId: 'bard', backgroundId: 'noble', appearance: { tinctureId: 'pink', description: '' } }),
      ctx,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.issues.map((i) => i.field).sort(), ['appearance', 'backgroundId', 'classId', 'raceId']);
  });

  it('enforces name length after trimming', () => {
    assert.equal(createCharacter(draft({ name: '   a   ' }), ctx).ok, false);
    assert.equal(createCharacter(draft({ name: 'x'.repeat(defaultCharacterRules.nameMaxLength + 1) }), ctx).ok, false);
    const ok = createCharacter(draft({ name: '  Gil   gamesh ' }), ctx);
    assert.ok(ok.ok && ok.character.name === 'Gil gamesh');
  });

  it('limits free-text fields', () => {
    const long = 'x'.repeat(defaultCharacterRules.freeTextMaxLength + 1);
    assert.equal(createCharacter(draft({ personality: { ideals: long, bonds: '', motivation: '' } }), ctx).ok, false);
    assert.equal(createCharacter(draft({ appearance: { tinctureId: 'or', description: long } }), ctx).ok, false);
  });
});

describe('attribute helpers', () => {
  it('treats the starting score as untested and anything above as tested', () => {
    assert.equal(isUntested(1), true);
    assert.equal(isUntested(2), false);
  });

  it('normalises whitespace in names', () => {
    assert.equal(normaliseName('  Ur   Nammu  '), 'Ur Nammu');
  });
});
