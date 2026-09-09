/**
 * Single source of truth for the ecosystem this preview runs on.
 * Swapping programs is an edit to this file plus the repository fixtures.
 */
export const PROGRAM = {
  /** Short name used in headings and chips. */
  name: 'Stellar',
  /** Full name used once, in the landing copy. */
  full: 'Stellar Ecosystem Program',
  /** How the chain is described in prose. */
  chain: 'Stellar',
  descriptor: 'the open network for payments',
  /** Reward asset. */
  asset: 'USDC',
} as const;

/** GitHub's language colours, so language dots read the way contributors expect. */
export const LANG_COLOR: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Rust: '#dea584',
  Solidity: '#aa6746',
  Go: '#00add8',
  Python: '#3572a5',
  MDX: '#fcb32c',
  CSS: '#663399',
  'C++': '#f34b7d',
  Dart: '#00b4ab',
};

/** Real GitHub avatar for an organization. Falls back to a letter tile on error. */
export const orgAvatar = (org: string, size = 80) =>
  `https://github.com/${encodeURIComponent(org)}.png?size=${size}`;
