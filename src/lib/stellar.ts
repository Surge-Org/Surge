/**
 * Stellar network facts.
 *
 * Everything chain-shaped that the interface needs to render — which network it
 * is pointed at, where to send someone to verify a thing themselves, what a
 * passphrase is — lives here rather than being inlined at the call sites. The
 * preview runs without any of it (see `src/lib/model.ts` for the fixtures it
 * actually draws), but the labels, the explorer links and the units are real, so
 * what is on screen matches what a contributor would see against a live network.
 */

export type NetworkId = 'public' | 'testnet' | 'futurenet' | 'local';

export interface Network {
  id: NetworkId;
  /** How the network is named in the interface. */
  label: string;
  /**
   * The network passphrase every transaction is signed against. This is the
   * value that makes a signature valid on one network and worthless on another,
   * which is why it is the thing worth displaying when there is any doubt about
   * where a transaction is headed.
   */
  passphrase: string;
  /** Horizon, for classic account and payment history. */
  horizon?: string;
  /** Soroban JSON-RPC, for contract reads and simulation. */
  rpc?: string;
  /** stellar.expert path segment for this network, where it has one. */
  explorer?: string;
  /** Whether funds on this network are real. Drives how loudly we say so. */
  live: boolean;
}

/**
 * The four networks worth naming.
 *
 * `local` has no endpoints because a local quickstart container's ports belong to
 * whoever's machine it is running on — it is here so the badge has something
 * honest to say rather than claiming testnet.
 */
export const NETWORKS: Record<NetworkId, Network> = {
  public: {
    id: 'public',
    label: 'Mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizon: 'https://horizon.stellar.org',
    explorer: 'public',
    live: true,
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    passphrase: 'Test SDF Network ; September 2015',
    horizon: 'https://horizon-testnet.stellar.org',
    rpc: 'https://soroban-testnet.stellar.org',
    explorer: 'testnet',
    live: false,
  },
  futurenet: {
    id: 'futurenet',
    label: 'Futurenet',
    passphrase: 'Test SDF Future Network ; October 2022',
    horizon: 'https://horizon-futurenet.stellar.org',
    rpc: 'https://rpc-futurenet.stellar.org',
    live: false,
  },
  local: {
    id: 'local',
    label: 'Local',
    passphrase: 'Standalone Network ; February 2017',
    live: false,
  },
};

/**
 * The network this build talks about.
 *
 * Testnet, and deliberately not configurable from the interface. A network
 * switcher on a page that cannot sign anything would be a control that changes
 * only the labels, which is worse than no control at all.
 */
export const NETWORK = NETWORKS.testnet;

/**
 * Stroops per whole unit. Every Stellar asset carries seven decimal places —
 * classic assets and Soroban tokens alike — so this is one constant, not a
 * per-asset field.
 */
export const STROOPS = 10_000_000n;

/**
 * Amounts are `bigint`, not `number`.
 *
 * The contract stores them as `i128`, and a wave budget in stroops is already
 * eleven digits before anything interesting happens. That fits in a double
 * today, but `number` arithmetic on money is how you get a payout that is a
 * fraction of a stroop off and a total that does not reconcile — and the
 * reconciliation is the whole point of an escrow. Converting at the edges keeps
 * every intermediate exact.
 */
export const toStroops = (units: number): bigint =>
  BigInt(Math.round(units * Number(STROOPS)));

/** Whole units, for the rare case that wants a float (chart geometry, widths). */
export const toUnits = (stroops: bigint): number => Number(stroops) / Number(STROOPS);

/**
 * Formats an amount for display: grouped thousands, and only as many decimal
 * places as the amount actually has.
 *
 * Trailing zeros are trimmed because a wave budget is a round number and
 * rendering it as `25,000.0000000` reads as false precision. Dust, on the other
 * hand, is *only* visible in the last places, so nothing is rounded away — the
 * two cases are the same function because the alternative is a component
 * guessing which one it is holding.
 */
export function formatAmount(stroops: bigint): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;
  const whole = absolute / STROOPS;
  const fraction = absolute % STROOPS;

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = fraction.toString().padStart(7, '0').replace(/0+$/, '');

  return `${negative ? '-' : ''}${grouped}${decimals ? `.${decimals}` : ''}`;
}

/**
 * The exact stroop count, grouped.
 *
 * Used where the smallest unit is the subject rather than an implementation
 * detail — rounding dust, a share that floored to nothing. Anything that says
 * "stroops" on screen should be showing this, not a formatted decimal.
 */
export const formatStroops = (stroops: bigint): string =>
  stroops.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export interface Asset {
  /** Asset code as it appears on a trustline or in a contract's metadata. */
  code: string;
  /** Full name, for the one place per screen that spells it out. */
  name: string;
  /**
   * Classic issuer for this asset on mainnet, where it has one.
   *
   * NOT VERIFIED FROM THIS REPOSITORY. Check it against the issuer the asset's
   * own operator publishes before pointing anything at mainnet — an issuer is 56
   * characters and a wrong one is a different asset that happens to share a code,
   * which is exactly the mistake this field exists to stop people making by hand.
   */
  issuer?: string;
  /** Whether this is the network's native asset rather than an issued one. */
  native?: boolean;
}

/**
 * The assets this program touches.
 *
 * USDC is the reward asset — the wave pool is denominated in it, and it is what
 * a contributor is actually paid. XLM is here because it is what fees are paid
 * in, so a contributor who has been paid and still cannot move the funds needs
 * the interface to be able to name the reason.
 */
export const ASSETS = {
  USDC: {
    code: 'USDC',
    name: 'USD Coin',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  XLM: {
    code: 'XLM',
    name: 'Lumens',
    native: true,
  },
} as const satisfies Record<string, Asset>;

/** The asset a wave pool pays out in. */
export const REWARD_ASSET = ASSETS.USDC;

/** An amount with its asset, the way it should always be said out loud. */
export const withAsset = (stroops: bigint, asset: Asset = REWARD_ASSET): string =>
  `${formatAmount(stroops)} ${asset.code}`;
