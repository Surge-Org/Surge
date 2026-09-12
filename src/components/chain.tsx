/**
 * Chain chrome.
 *
 * The components that render network facts rather than program data. They are
 * separate from `ui.tsx` because they are the only place that imports
 * `lib/stellar.ts`, and keeping that boundary visible means the generic UI
 * primitives stay usable on a page that has nothing to do with a chain.
 */

import {
  NETWORK, REWARD_ASSET, formatAmount, formatStroops, type Asset, type Network,
} from '../lib/stellar';

/**
 * Which network the interface is pointed at.
 *
 * Renders loudly on a live network and quietly everywhere else. The asymmetry is
 * the point: a testnet badge is orientation, and a mainnet badge is a warning
 * that the amounts on this page are real money. Anything that treats the two the
 * same is a badge nobody reads.
 *
 * The passphrase goes in the `title`, because it is the value that actually
 * settles which network a transaction would reach — the label is a name someone
 * chose, and the passphrase is what a signature is bound to.
 */
export function NetworkBadge({ network = NETWORK }: { network?: Network }) {
  return (
    <span
      className="net"
      data-live={network.live}
      title={network.passphrase}
      aria-label={`Network: ${network.label}${network.live ? ' — real funds' : ''}`}
    >
      <span className="net-dot" aria-hidden="true" />
      {network.label}
    </span>
  );
}

/**
 * An asset, named and colour-coded.
 *
 * `chip` gives it a bordered surface for standing alone in a row; without it, it
 * is an inline label to sit beside an amount.
 */
export function AssetChip({ asset = REWARD_ASSET, chip = false }: { asset?: Asset; chip?: boolean }) {
  return (
    <span
      className={`asset ${chip ? 'asset-chip' : ''}`.trim()}
      data-native={!!asset.native}
      title={asset.name}
    >
      <span className="asset-dot" aria-hidden="true" />
      {asset.code}
    </span>
  );
}

/**
 * An amount, in the asset's own units.
 *
 * The whole units and the fraction are separate spans so the seven decimal places
 * can be dimmed. That is the compromise between two real needs: a contributor
 * scanning a list wants to read "1,250" without counting zeros, and a contributor
 * checking a payout needs every stroop to be present and selectable. Truncating
 * would serve the first and break the second; showing all seven at full contrast
 * serves the second and makes the first unreadable.
 *
 * Zero is dimmed as a whole, because a zero share is an empty state rather than a
 * number worth reading — and it is common enough (applied, never assigned) that
 * it should not draw the eye.
 */
export function Amount({
  stroops, asset = REWARD_ASSET, code = true,
}: {
  stroops: bigint;
  asset?: Asset;
  /** Suppress the asset code where a column header already says it. */
  code?: boolean;
}) {
  const [whole, fraction] = formatAmount(stroops).split('.');
  return (
    <span className="amt num" data-zero={stroops === 0n}>
      {whole}
      {fraction && <span className="amt-frac">.{fraction}</span>}
      {code && <span className="amt-code">{asset.code}</span>}
    </span>
  );
}

/**
 * An exact stroop count.
 *
 * For the places where the smallest unit is the subject rather than an
 * implementation detail — rounding dust, a share that floored to nothing. Says
 * "stroops" out loud so the number is not mistaken for whole units, which at
 * seven decimal places is a factor of ten million.
 */
export function Stroops({ stroops }: { stroops: bigint }) {
  return (
    <span className="amt num">
      {formatStroops(stroops)}
      <span className="amt-code">stroops</span>
    </span>
  );
}
