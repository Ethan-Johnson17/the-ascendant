import { defaultProgressionConfig, xpActivityKinds, type ProgressionConfig, type XpActivityKind } from './config.ts';

/**
 * Plans an XP award. The engine decides the amount and the idempotency key; the database applies
 * the award atomically and refuses a second award with the same key (unique constraint), so a
 * double-click, retry or replayed request can never pay twice.
 *
 * Anti-farming: the key is derived from what was achieved (kind + source), not from the attempt,
 * so repeating the same lesson or quest yields the same key and therefore no further XP.
 * Retention reviews are the deliberate exception: each scheduled review is its own source.
 */

export const XP_CONFIG_VERSION = 'progression-v1';

export interface XpAwardRequest {
  readonly kind: XpActivityKind;
  /** What was completed: an activity id, quest id, boss attempt id or scheduled-review id. */
  readonly sourceId: string;
  readonly campaignId: string | null;
}

export interface XpAwardPlan {
  readonly kind: XpActivityKind;
  readonly amount: number;
  readonly idempotencyKey: string;
  readonly campaignId: string | null;
  readonly sourceId: string;
  readonly configVersion: string;
}

export function idempotencyKeyFor(kind: XpActivityKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function planXpAward(req: XpAwardRequest, config: ProgressionConfig = defaultProgressionConfig): XpAwardPlan {
  if (!xpActivityKinds.includes(req.kind)) throw new RangeError(`Unknown XP kind ${String(req.kind)}`);
  const sourceId = req.sourceId.trim();
  if (sourceId.length === 0 || sourceId.length > 200) throw new RangeError('sourceId must be 1–200 characters');
  const amount = config.baseXp[req.kind];
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError(`Configured XP for ${req.kind} must be a positive integer`);
  return {
    kind: req.kind,
    amount,
    idempotencyKey: idempotencyKeyFor(req.kind, sourceId),
    campaignId: req.campaignId,
    sourceId,
    configVersion: XP_CONFIG_VERSION,
  };
}

/** Applies a plan to an in-memory ledger: the same semantics the database enforces. */
export function applyToLedger<T extends { idempotencyKey: string; amount: number }>(ledger: readonly T[], entry: T): { ledger: readonly T[]; applied: boolean } {
  if (ledger.some((e) => e.idempotencyKey === entry.idempotencyKey)) return { ledger, applied: false };
  return { ledger: [...ledger, entry], applied: true };
}

export function ledgerTotal(ledger: readonly { amount: number; campaignId?: string | null }[], campaignId?: string): number {
  return ledger.filter((e) => campaignId === undefined || e.campaignId === campaignId).reduce((sum, e) => sum + e.amount, 0);
}
