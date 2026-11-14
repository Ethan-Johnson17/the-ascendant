import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { currentCampaign, setCampaignStatus, startCampaign, touchCampaign, type PlayerCampaign } from './campaigns.ts';

const t = (minute: number) => new Date(Date.UTC(2026, 10, 13, 12, minute));

function start(list: readonly PlayerCampaign[], id: string, templateId: string, minute: number) {
  const r = startCampaign(list, { id, templateId, curriculumVersion: 0, now: t(minute) });
  assert.ok(r.ok, `start ${id}`);
  return r.campaigns;
}

describe('startCampaign', () => {
  it('creates an active campaign with zero campaign XP', () => {
    const [c] = start([], 'a', 'history', 0);
    assert.equal(c?.status, 'active');
    assert.equal(c?.campaignXp, 0);
  });

  it('refuses to start the same template twice', () => {
    const list = start([], 'a', 'history', 0);
    const again = startCampaign(list, { id: 'b', templateId: 'history', curriculumVersion: 0, now: t(1) });
    assert.equal(again.ok, false);
  });

  it('keeps campaigns independent: starting one leaves the others unchanged', () => {
    const one = start([], 'a', 'history', 0);
    const withXp = one.map((c) => ({ ...c, campaignXp: 120 }));
    const two = start(withXp, 'b', 'economics', 1);
    assert.equal(two.find((c) => c.id === 'a')?.campaignXp, 120);
    assert.equal(two.find((c) => c.id === 'b')?.campaignXp, 0);
  });
});

describe('setCampaignStatus', () => {
  it('pauses and resumes without touching XP', () => {
    const list = start([], 'a', 'history', 0).map((c) => ({ ...c, campaignXp: 75 }));
    const paused = setCampaignStatus(list, 'a', 'paused', t(5));
    assert.ok(paused.ok);
    if (!paused.ok) return;
    assert.equal(paused.campaign.status, 'paused');
    assert.equal(paused.campaign.campaignXp, 75);
    const resumed = setCampaignStatus(paused.campaigns, 'a', 'active', t(6));
    assert.ok(resumed.ok && resumed.campaign.status === 'active' && resumed.campaign.campaignXp === 75);
  });

  it('rejects no-op and impossible transitions', () => {
    const list = start([], 'a', 'history', 0);
    assert.equal(setCampaignStatus(list, 'a', 'active', t(1)).ok, false);
    assert.equal(setCampaignStatus(list, 'missing', 'paused', t(1)).ok, false);
    const done = list.map((c) => ({ ...c, status: 'completed' as const }));
    assert.equal(setCampaignStatus(done, 'a', 'active', t(1)).ok, false);
  });
});

describe('currentCampaign', () => {
  it('is the most recently played active campaign and ignores paused ones', () => {
    let list = start([], 'a', 'history', 0);
    list = start(list, 'b', 'economics', 1);
    assert.equal(currentCampaign(list)?.id, 'b');
    const touched = touchCampaign(list, 'a', t(2));
    assert.ok(touched.ok);
    if (!touched.ok) return;
    assert.equal(currentCampaign(touched.campaigns)?.id, 'a');
    const paused = setCampaignStatus(touched.campaigns, 'a', 'paused', t(3));
    assert.ok(paused.ok && currentCampaign(paused.campaigns)?.id === 'b');
  });

  it('is null when nothing is active', () => {
    assert.equal(currentCampaign([]), null);
  });
});
