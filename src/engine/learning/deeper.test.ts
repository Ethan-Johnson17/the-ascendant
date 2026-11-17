import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deeperDifficulty, deeperStatus } from './deeper.ts';

describe('Go deeper (AI-made courses)', () => {
  it('offers the stage above the lesson’s hardest check, once the skill is ready', () => {
    assert.deepEqual(deeperStatus([2], 2), { kind: 'ready', stage: 3 });
    assert.deepEqual(deeperStatus([2, 3], 3), { kind: 'ready', stage: 4 });
    assert.deepEqual(deeperStatus([3, 4], 5), { kind: 'ready', stage: 5 });
  });

  it('waits (and spends nothing) until the skill reaches the stage below', () => {
    assert.deepEqual(deeperStatus([2], 1), { kind: 'waiting', stage: 3, needs: 2 });
    assert.deepEqual(deeperStatus([3], 2), { kind: 'waiting', stage: 4, needs: 3 });
  });

  it('stops at Advanced; Expert is never written', () => {
    assert.deepEqual(deeperStatus([2, 3, 4, 5], 6), { kind: 'complete' });
    assert.deepEqual(deeperStatus([], 3), { kind: 'complete' }, 'a lesson that is not built has nothing to deepen');
  });

  it('keeps deeper questions above pure recall', () => {
    assert.deepEqual([1, 2, 3].map(deeperDifficulty), [2, 2, 3]);
  });
});
