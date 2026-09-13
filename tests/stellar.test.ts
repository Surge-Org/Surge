/**
 * Unit tests for the pure Stellar layer.
 *
 * Run with Node's own test runner and its built-in type stripping — no bundler, no
 * jsdom, no new dependency. `src/lib/stellar.ts` imports nothing, which is what
 * makes that possible and is a reason to keep it that way: the module deciding how
 * money is formatted and divided should be testable without a browser.
 *
 * Imported with an explicit `.ts` extension because Node resolves real paths rather
 * than a bundler's extensionless ones.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASSETS, NETWORKS, REWARD_ASSET, STROOPS, addressKind, addressUrl, dustOf,
  explorerUrl, formatAmount, formatStroops, isSecret, shareOf, shortAddress,
  toStroops, toUnits, withAsset,
} from '../src/lib/stellar.ts';

/** Valid-length strkeys. Prefix and length are all `addressKind` reads. */
const ACCOUNT = `G${'A'.repeat(55)}`;
const CONTRACT = `C${'B'.repeat(55)}`;
const SEED = `S${'C'.repeat(55)}`;
const MUXED = `M${'D'.repeat(68)}`;

describe('amounts', () => {
  it('formats whole units with grouped thousands', () => {
    assert.equal(formatAmount(25_000n * STROOPS), '25,000');
    assert.equal(formatAmount(999n * STROOPS), '999');
    assert.equal(formatAmount(0n), '0');
  });

  it('trims trailing zeros but never significant places', () => {
    // 1.5 USDC is 15,000,000 stroops; the other five places are noise.
    assert.equal(formatAmount(15_000_000n), '1.5');
    // One stroop is only visible in the last place, so nothing may be dropped.
    assert.equal(formatAmount(1n), '0.0000001');
    assert.equal(formatAmount(STROOPS - 1n), '0.9999999');
  });

  it('keeps the sign in front of the grouped value', () => {
    assert.equal(formatAmount(-25_000n * STROOPS), '-25,000');
    assert.equal(formatAmount(-1n), '-0.0000001');
  });

  it('formats an exact stroop count without a decimal point', () => {
    assert.equal(formatStroops(250_000_000_000n), '250,000,000,000');
    assert.equal(formatStroops(449n), '449');
  });

  it('round-trips whole units through stroops', () => {
    assert.equal(toStroops(25_000), 250_000_000_000n);
    assert.equal(toUnits(250_000_000_000n), 25_000);
    // Fractional input lands on an exact stroop rather than a float artefact.
    assert.equal(toStroops(0.1), 1_000_000n);
  });

  it('always names the asset alongside the number', () => {
    assert.equal(withAsset(25_000n * STROOPS), '25,000 USDC');
    assert.equal(withAsset(STROOPS, ASSETS.XLM), '1 XLM');
    assert.equal(REWARD_ASSET.code, 'USDC');
  });
});

describe('strkeys', () => {
  it('classifies by prefix and length', () => {
    assert.equal(addressKind(ACCOUNT), 'account');
    assert.equal(addressKind(CONTRACT), 'contract');
    assert.equal(addressKind(SEED), 'secret');
    assert.equal(addressKind(MUXED), 'muxed');
  });

  it('rejects anything of the wrong length', () => {
    // The prefix alone is not enough — a truncated key is not an account.
    assert.equal(addressKind('GABC'), 'unknown');
    assert.equal(addressKind(`${ACCOUNT}EXTRA`), 'unknown');
    assert.equal(addressKind(''), 'unknown');
  });

  it('identifies a seed so nothing renders one', () => {
    assert.equal(isSecret(SEED), true);
    // A seed and an account id are the same length and shape, which is exactly why
    // this check has to exist at all.
    assert.equal(SEED.length, ACCOUNT.length);
    assert.equal(isSecret(ACCOUNT), false);
    assert.equal(isSecret(CONTRACT), false);
  });

  it('truncates both ends, never just the head', () => {
    const short = shortAddress(ACCOUNT, 4, 4);
    assert.ok(short.startsWith('GAAA'), 'keeps the leading characters');
    assert.ok(short.endsWith('AAAA'), 'keeps the trailing characters');
    assert.ok(short.includes('…'));
    // Two keys sharing a prefix must not truncate to the same string.
    assert.notEqual(shortAddress(`G${'A'.repeat(54)}X`), shortAddress(`G${'A'.repeat(54)}Y`));
  });

  it('leaves a value shorter than the truncation alone', () => {
    assert.equal(shortAddress('GABC', 4, 4), 'GABC');
  });
});

describe('explorer links', () => {
  it('builds a path per kind on a network that has an explorer', () => {
    assert.equal(
      explorerUrl({ kind: 'account', id: ACCOUNT }, NETWORKS.testnet),
      `https://stellar.expert/explorer/testnet/account/${ACCOUNT}`,
    );
    assert.equal(
      explorerUrl({ kind: 'contract', id: CONTRACT }, NETWORKS.public),
      `https://stellar.expert/explorer/public/contract/${CONTRACT}`,
    );
    assert.equal(
      explorerUrl({ kind: 'tx', id: 'abc123' }, NETWORKS.testnet),
      'https://stellar.expert/explorer/testnet/tx/abc123',
    );
  });

  it('identifies an issued asset as CODE-ISSUER and the native one by code', () => {
    assert.equal(
      explorerUrl({ kind: 'asset', id: 'USDC', issuer: ACCOUNT }, NETWORKS.public),
      `https://stellar.expert/explorer/public/asset/USDC-${ACCOUNT}`,
    );
    assert.equal(
      explorerUrl({ kind: 'asset', id: 'XLM' }, NETWORKS.public),
      'https://stellar.expert/explorer/public/asset/XLM',
    );
  });

  it('returns null rather than a dead link where there is no explorer', () => {
    assert.equal(explorerUrl({ kind: 'account', id: ACCOUNT }, NETWORKS.futurenet), null);
    assert.equal(explorerUrl({ kind: 'account', id: ACCOUNT }, NETWORKS.local), null);
  });

  it('never puts a seed or an unrecognised string in a URL', () => {
    assert.equal(addressUrl(SEED, NETWORKS.testnet), null);
    assert.equal(addressUrl('not-an-address', NETWORKS.testnet), null);
    assert.ok(addressUrl(ACCOUNT, NETWORKS.testnet)?.includes(ACCOUNT));
  });
});

describe('share arithmetic', () => {
  const pool = 25_000n * STROOPS;

  it('divides in proportion to points', () => {
    assert.equal(shareOf(pool, 200, 450), (pool * 200n) / 450n);
    assert.equal(shareOf(pool, 100, 200), pool / 2n);
    assert.equal(shareOf(pool, 200, 200), pool);
  });

  it('distinguishes no denominator from no share', () => {
    // A wave with no points recorded has no valid payout at all.
    assert.equal(shareOf(pool, 200, 0), null);
    // Applied but never assigned: entitled to exactly zero, which is not an error.
    assert.equal(shareOf(pool, 0, 450), 0n);
    // Opened but never funded.
    assert.equal(shareOf(0n, 200, 450), 0n);
  });

  it('multiplies before dividing', () => {
    // The case the contract documents: dividing first floors the per-point rate and
    // loses 111 stroops off this one share.
    assert.equal(shareOf(pool, 200, 450), 111_111_111_111n);
    assert.equal((pool / 450n) * 200n, 111_111_111_000n);
  });

  it('agrees with the contract that floored shares never exceed the pool', () => {
    for (const awards of [[200, 150, 100], [200, 200, 200], [199, 151, 101]]) {
      const total = awards.reduce((a, b) => a + b, 0);
      const paid = awards.reduce((sum, p) => sum + (shareOf(pool, p, total) ?? 0n), 0n);
      assert.ok(paid <= pool, `paid ${paid} exceeds pool ${pool}`);
      // And the remainder is bounded by the point total, not by the pool.
      assert.ok(pool - paid < BigInt(total));
    }
  });

  it('reports the dust flooring leaves behind', () => {
    const dust = dustOf(pool, [200, 150, 100]);
    assert.ok(dust > 0n && dust < 450n, `dust ${dust} out of range`);
    // An exact split leaves nothing.
    assert.equal(dustOf(pool, [100, 100]), 0n);
    // No points at all: the whole pool is unallocated.
    assert.equal(dustOf(pool, []), pool);
  });
});
