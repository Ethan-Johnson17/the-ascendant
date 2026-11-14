import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attributes, backgrounds, classes, races, tinctures } from './character/options.ts';
import { campaignTemplates } from './campaigns/catalog.ts';
import { attributeIds } from '../engine/character/attributes.ts';

const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;

describe('character content', () => {
  it('matches the races, classes and backgrounds in GAME_DESIGN.md §3', () => {
    assert.deepEqual(races.map((r) => r.name), ['Human', 'Elf', 'Dwarf', 'Halfling']);
    assert.deepEqual(classes.map((c) => c.name), ['Fighter', 'Ranger', 'Rogue', 'Wizard', 'Cleric']);
    assert.deepEqual(backgrounds.map((b) => b.name), ['Soldier', 'Scholar', 'Merchant', 'Artisan', 'Explorer']);
  });

  it('has unique ids and complete descriptions', () => {
    for (const list of [races, classes, backgrounds, tinctures]) assert.ok(unique(list.map((x) => x.id)));
    for (const r of races) assert.ok(r.trait.name && r.trait.description && r.lore);
    for (const c of classes) assert.ok(c.ability.name && c.ability.description && c.lore);
    for (const b of backgrounds) assert.ok(b.startingGear.length > 0 && b.storyEffect && b.lore);
  });

  it('describes all six attributes, and class signatures use real attributes', () => {
    assert.deepEqual(attributes.map((a) => a.id), [...attributeIds]);
    for (const c of classes) for (const a of c.signatureAttributes) assert.ok(attributeIds.includes(a), c.id);
  });
});

describe('campaign catalogue', () => {
  it('has unique template ids and the History pilot', () => {
    assert.ok(unique(campaignTemplates.map((t) => t.id)));
    assert.ok(campaignTemplates.some((t) => t.subject === 'History' && t.module === 'Ancient Mesopotamia'));
  });

  it('gives every template six sub-skills and ties every competency to one of them', () => {
    for (const t of campaignTemplates) {
      assert.deepEqual(Object.keys(t.subSkills).sort(), [...attributeIds].sort(), t.id);
      assert.ok(unique(t.competencies.map((c) => c.key)), `${t.id} competency keys`);
      for (const c of t.competencies) assert.ok(attributeIds.includes(c.attribute), `${t.id}/${c.key}`);
      // Every sub-skill has at least one competency, so every attribute can grow in this subject.
      for (const a of attributeIds) assert.ok(t.competencies.some((c) => c.attribute === a), `${t.id} has no ${a} competency`);
    }
  });
});
