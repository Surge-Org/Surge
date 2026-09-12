/**
 * The wave pool contract's interface, in TypeScript.
 *
 * Hand-written to mirror `contracts/wave-pool` rather than generated, because
 * there is nothing deployed to generate against yet — `stellar contract bindings
 * typescript` needs a contract id or a wasm hash on a network. When the contract
 * is deployed this file is what the generated bindings replace, so it is kept to
 * the shape the generator emits: the same field names, the same field order, and
 * `bigint` wherever the contract says `i128`.
 *
 * Until then it is doing real work. The error table below is the only place in
 * the interface that can turn a contract failure into something a contributor can
 * act on, and the discriminants have to match the Rust exactly or every message
 * is wrong by one.
 */

import { REWARD_ASSET, formatAmount, shareOf, withAsset } from './stellar';

/** `WaveStatus` in the contract. There is no transition back to `Open`. */
export type WaveStatus = 'Open' | 'Closed';

/**
 * The contract's `Wave` struct.
 *
 * Field names match the Rust so a generated replacement is a drop-in. The pairs
 * that look redundant are not:
 *
 * - `budget` is what the program announced; `escrowed` is what actually arrived.
 *   An underfunded wave pays against the second and still reports the first.
 * - `escrowed` keeps moving while the wave is open; `pool` is `escrowed` frozen
 *   at close and is the divisor for every share. Two contributors with equal
 *   points are paid equally because payouts divide `pool` and not a live balance.
 */
export interface Wave {
  number: number;
  start: bigint;
  end: bigint;
  budget: bigint;
  escrowed: bigint;
  total_points: number;
  status: WaveStatus;
  pool: bigint;
  paid: bigint;
  claim_deadline: bigint;
}

/** The contract's `Config`. Both are fixed at deploy; only `admin` can change. */
export interface Config {
  admin: string;
  token: string;
}

/**
 * The contract's error discriminants.
 *
 * These are the contract's public ABI — the integer is what comes back in a
 * failed transaction result, and the Rust documents them as append-only. Any
 * value that is off by one here mislabels every failure from that point on, so
 * the numbers are written out explicitly rather than left to enum ordering.
 */
export enum WavePoolError {
  WaveExists = 1,
  WaveNotFound = 2,
  WaveNotOpen = 3,
  WaveNotClosed = 4,
  InvalidWindow = 5,
  InvalidBudget = 6,
  InvalidAmount = 7,
  InvalidPoints = 8,
  PointsUnderflow = 9,
  NoPointsRecorded = 10,
  NothingToClaim = 11,
  AlreadyClaimed = 12,
  ClaimPeriodOpen = 13,
  Overflow = 14,
  PoolExhausted = 15,
}

/**
 * What to tell someone when a call fails.
 *
 * Written for whoever hit the error, not for whoever wrote the contract: each one
 * says what happened and, where there is one, what to do next. `NothingToClaim`
 * and `PoolExhausted` are the two that matter most to get right — both mean "you
 * were not paid", and they have completely different remedies.
 */
export const ERROR_MESSAGE: Record<WavePoolError, string> = {
  [WavePoolError.WaveExists]: 'That wave number is already in use.',
  [WavePoolError.WaveNotFound]: 'No wave has been opened under that number.',
  [WavePoolError.WaveNotOpen]: 'This wave is closed. Funding and points are fixed once it closes.',
  [WavePoolError.WaveNotClosed]: 'This wave has not closed yet, so shares are not settled.',
  [WavePoolError.InvalidWindow]: 'The wave must end after it starts.',
  [WavePoolError.InvalidBudget]: 'A wave needs a budget above zero.',
  [WavePoolError.InvalidAmount]: 'Enter an amount above zero.',
  [WavePoolError.InvalidPoints]: 'Award at least one point.',
  [WavePoolError.PointsUnderflow]: 'That is more points than this contributor holds.',
  [WavePoolError.NoPointsRecorded]: 'This wave closed with no points recorded, so there is nothing to divide.',
  [WavePoolError.NothingToClaim]: 'You have no share in this wave. If it is still being funded, try again once it is.',
  [WavePoolError.AlreadyClaimed]: 'You have already claimed this wave.',
  [WavePoolError.ClaimPeriodOpen]: 'The claim window is still open. Unclaimed funds can only be recovered after it closes.',
  [WavePoolError.Overflow]: 'That amount is too large to process.',
  [WavePoolError.PoolExhausted]: 'This wave was closed out after its claim window expired and the funds were returned to the program. Contact the maintainers.',
};

/** A contract error code as a sentence, falling back for anything unrecognised. */
export const errorMessage = (code: number): string =>
  ERROR_MESSAGE[code as WavePoolError] ?? 'The transaction was rejected by the contract.';

/** The divisor a share is computed against: live while open, frozen once closed. */
export const payoutBasis = (wave: Wave): bigint =>
  wave.status === 'Open' ? wave.escrowed : wave.pool;

/**
 * What a contributor holding `points` would be paid, mirroring `claimable`.
 *
 * A projection while the wave is open — it moves as funding arrives and as others
 * earn points — and the settled figure once it is closed.
 */
export const claimable = (wave: Wave, points: number): bigint | null =>
  shareOf(payoutBasis(wave), points, wave.total_points);

/** The share as an amount with its asset, or a dash when there is no denominator. */
export function claimableLabel(wave: Wave, points: number): string {
  const share = claimable(wave, points);
  return share === null ? '—' : withAsset(share, REWARD_ASSET);
}

/** How much of the pool has been paid out, as a percentage for a progress bar. */
export function paidFraction(wave: Wave): number {
  if (wave.pool <= 0n) return 0;
  return Number((wave.paid * 1000n) / wave.pool) / 10;
}

/** Unclaimed remainder — dust plus any share nobody came back for. */
export const unclaimed = (wave: Wave): bigint =>
  wave.pool > wave.paid ? wave.pool - wave.paid : 0n;

/** Funding progress against the announced budget, capped at 100. */
export function fundedFraction(wave: Wave): number {
  if (wave.budget <= 0n) return 0;
  const pct = Number((wave.escrowed * 1000n) / wave.budget) / 10;
  return Math.min(pct, 100);
}

/** `escrowed` against `budget`, for the one line that says where funding stands. */
export const fundingLabel = (wave: Wave): string =>
  `${formatAmount(wave.escrowed)} of ${withAsset(wave.budget, REWARD_ASSET)}`;
