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
