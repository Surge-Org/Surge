/**
 * Chain chrome.
 *
 * The components that render network facts rather than program data. They are
 * separate from `ui.tsx` because they are the only place that imports
 * `lib/stellar.ts`, and keeping that boundary visible means the generic UI
 * primitives stay usable on a page that has nothing to do with a chain.
 */

import { useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import {
  NETWORK, REWARD_ASSET, addressKind, addressUrl, formatAmount, formatStroops,
  isSecret, shortAddress, type Asset, type Network,
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

/**
 * A strkey, truncated, with a copy button and an explorer link where one exists.
 *
 * **Refuses to render a secret seed.** A seed is the same length and shape as an
 * account id, so any component that displays "an address" will display one
 * happily — and a seed that has been on screen, in a screenshot, or in a shared
 * preview is unrecoverable. The check is here rather than at the call sites
 * because it only takes one call site forgetting.
 *
 * The full key is always in `title` and always what gets copied. Truncation is a
 * display choice, and a component that truncated what it copied would be actively
 * dangerous — a half address that looks plausible is worse than an obvious error.
 */
export function AddressPill({
  value, kind: kindLabel, lead = 6, tail = 6,
}: {
  value: string;
  /** Overrides the label derived from the prefix, e.g. 'Admin', 'Token'. */
  kind?: string;
  lead?: number;
  tail?: number;
}) {
  const [copied, setCopied] = useState(false);

  if (isSecret(value)) {
    return (
      <span className="addr-refused" role="alert">
        <ShieldAlert size={12} aria-hidden="true" />
        Secret key — not shown
      </span>
    );
  }

  const kind = addressKind(value);
  const url = addressUrl(value);
  const short = shortAddress(value, lead, tail);
  const label = kindLabel ?? (kind === 'contract' ? 'Contract' : kind === 'account' ? 'Account' : '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* Clipboard is unavailable over plain http and in some embeds. The key is
         in the title either way, so selecting it by hand still works. */
    }
  };

  const body = (
    <>
      {label && <span className="addr-kind">{label}</span>}
      <span>{short}</span>
    </>
  );

  return (
    <span className="addr">
      {url ? (
        <a
          className="addr-key"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={`${value} — open in stellar.expert`}
        >
          {body}
        </a>
      ) : (
        <span className="addr-key" title={value}>{body}</span>
      )}
      <button
        className="addr-copy"
        type="button"
        onClick={copy}
        data-done={copied}
        aria-label={copied ? 'Copied' : 'Copy full address'}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
