/**
 * Chain chrome.
 *
 * The components that render network facts rather than program data. They are
 * separate from `ui.tsx` because they are the only place that imports
 * `lib/stellar.ts`, and keeping that boundary visible means the generic UI
 * primitives stay usable on a page that has nothing to do with a chain.
 */

import { NETWORK, type Network } from '../lib/stellar';

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
