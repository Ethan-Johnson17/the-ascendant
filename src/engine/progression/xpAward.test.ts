import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyToLedger, ledgerTotal, planXpAward, type XpAwardPlan } from './xpAward.ts';
import { defaultProgressionConfig } from './config.ts';
import { levelFromXp } from './levels.ts';

describe('planXpAward', () => {
  it('takes the amount from configuration, never from the caller', () => {
    const plan = planXpAward({ kind: 'lesson_completed', sourceId: 'activity-1', campaignId: 'c1' });
    assert.equal(plan.amount, defaultProgressionConfig.baseXp.lesson_completed);
  });

  it('gives the same key for the same achievement, so repeats cannot farm XP', () => {
    const a = planXpAward({ kind: 'lesson_completed', sourceId: 'activity-1', campaignId: 'c1' });
    const b = planXpAward({ kind: 'lesson_completed', sourceId: ' activity-1 ', campaignId: 'c1' });
    assert.equal(a.idempotencyKey, b.idempotencyKey);
  });

  it('rejects unknown kinds and empty sources', () => {
    assert.throws(() => planXpAward({ kind: 'free_xp' as never, sourceId: 'x', campaignId: null }), RangeError);
    assert.throws(() => planXpAward({ kind: 'quest_completed', sourceId: '  ', campaignId: null }), RangeError);
  });
});

describe('ledger semantics', () => {
  const award = (kind: Parameters<typeof planXpAward>[0]['kind'], sourceId: string, campaignId: string) =>
    planXpAward({ kind, sourceId, campaignId });

  it('XP cannot be awarded twice for the same completed activity', () => {
    let ledger: readonly XpAwardPlan[] = [];
    const first = applyToLedger(ledger, award('lesson_completed', 'a1', 'c1'));
    ledger = first.ledger;
    const second = applyToLedger(ledger, award('lesson_completed', 'a1', 'c1'));
    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(ledgerTotal(second.ledger), defaultProgressionConfig.baseXp.lesson_completed);
  });

  it('keeps campaign XP isolated while character XP sums everything', () => {
    let ledger: readonly XpAwardPlan[] = [];
    for (const p of [award('lesson_completed', 'h1', 'history'), award('quest_completed', 'h2', 'history'), award('lesson_completed', 'e1', 'economics')]) {
      ledger = applyToLedger(ledger, p).ledger;
    }
    const xp = defaultProgressionConfig.baseXp;
    assert.equal(ledgerTotal(ledger, 'history'), xp.lesson_completed + xp.quest_completed);
    assert.equal(ledgerTotal(ledger, 'economics'), xp.lesson_completed);
    assert.equal(ledgerTotal(ledger), 2 * xp.lesson_completed + xp.quest_completed);
  });

  it('character level updates from the ledger total', () => {
    let ledger: readonly XpAwardPlan[] = [];
    for (let i = 0; i < 3; i++) ledger = applyToLedger(ledger, award('boss_defeated', `boss-${i}`, 'history')).ledger;
    const level = levelFromXp(ledgerTotal(ledger), defaultProgressionConfig.characterLevels).level;
    assert.ok(level > 1);
  });
});
