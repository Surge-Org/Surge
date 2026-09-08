export type Complexity = 'Trivial' | 'Medium' | 'High';
export type ApplicationStatus = 'Applied' | 'Assigned' | 'PR submitted' | 'Accepted' | 'Rejected';
export type RepoStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface Repo {
  id: string;
  org: string;
  name: string;
  description: string;
  languages: string[];
  stars: number;
  forks: number;
  /** Directory metadata, so a listing reads like a real repository entry. */
  topics?: string[];
  license?: string;
  updated?: string;
  /** Maintainer handle that submitted this repository. Seeded program repos have none. */
  ownerId?: string;
  /** A repository is only workable — and only gets a dashboard — once accepted. */
  status: RepoStatus;
  submitted?: string;
  reviewNote?: string;
}

export interface Wave {
  id: string;
  number: number;
  start: string;
  end: string;
  budget: number;
  status: 'Active' | 'Upcoming' | 'Completed';
}

export interface Issue {
  id: string;
  repoId: string;
  waveId: string;
  title: string;
  description: string;
  criteria: string[];
  complexity: Complexity;
  created: string;
}

export interface Application {
  issueId: string;
  message: string;
  status: ApplicationStatus;
  pr?: string;
  /** Sample contributor. Absent means the signed-in contributor. */
  applicant?: string;
}

export interface Reward {
  waveId: string;
  points: number;
  amount: number;
}

/** Contributor and maintainer are separate sessions — signing into one never grants the other. */
export interface Session {
  contributor: string | null;
  maintainer: string | null;
}

export interface State {
  version: 4;
  session: Session;
  repos: Repo[];
  waves: Wave[];
  issues: Issue[];
  applications: Application[];
  rewards: Reward[];
}

export const storageKey = 'surge-preview-v4';

export const pointsFor = (complexity: Complexity) =>
  ({ Trivial: 100, Medium: 150, High: 200 })[complexity];

export const formatMoney = (amount: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);

export const formatCount = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);

export const dateLabel = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "3 days ago" style relative label for repository freshness. */
export function relativeDate(date: string, now = new Date()): string {
  const then = new Date(date + 'T12:00:00');
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'last month' : `${months} months ago`;
}

export const repoName = (repo: Repo) => `${repo.org}/${repo.name}`;

export const isOwnApplication = (a: Application) => !a.applicant;
export const applicantName = (a: Application, profile: string) => a.applicant ?? profile;

/** Repositories the signed-in maintainer submitted. */
export const reposOwnedBy = (repos: Repo[], maintainer: string | null) =>
  maintainer ? repos.filter(r => r.ownerId === maintainer) : [];

/** The gate: a repo dashboard opens only for an accepted repo owned by this maintainer. */
export const canOpenRepoDashboard = (repo: Repo | undefined, maintainer: string | null) =>
  !!repo && !!maintainer && repo.ownerId === maintainer && repo.status === 'Accepted';

export function initialState(): State {
  return {
    version: 4,
    session: { contributor: null, maintainer: null },
    rewards: [],
    applications: [
      { issueId: '707', applicant: 'nadia.dev', status: 'Applied', message: 'I run an indexer that consumes these subscriptions in production and have handled reconnect storms before. Plan: a cursor per filter, backfill through getLogs on resume, dedupe on (blockHash, logIndex), and a test that severs the socket mid-stream.' },
      { issueId: '707', applicant: 'kwame-o', status: 'Applied', message: 'Happy to take this on. I would land the reconnect semantics and replay buffer first so it reviews on its own, document the config surface, then add backfill once the cursor behaviour is settled.' },
      { issueId: '94', applicant: 'lucia-m', status: 'Applied', message: 'Guard and module testing is close to my day job. I will table-drive the hooks against every execution entry point, add a re-entrancy test for disabled modules, and pin the threshold-change behaviour with explicit fixtures.' },
      { issueId: '128', applicant: 'tobi.k', status: 'Applied', message: 'I would attach decoded revert data to a dedicated error subclass, keep the original call parameters on it, and add type-level tests so the shape cannot regress silently.' },
    ],
    repos: [
      { id: 'stablecoin', org: 'circlefin', name: 'stablecoin-evm', description: 'Reference implementation of the USDC token contract for EVM networks.', languages: ['Solidity', 'TypeScript'], stars: 1120, forks: 486, topics: ['stablecoin', 'usdc', 'erc20'], license: 'Apache-2.0', updated: '2026-09-04', status: 'Accepted' },
      { id: 'foundry', org: 'foundry-rs', name: 'foundry', description: 'Fast, portable and modular toolkit for EVM application development.', languages: ['Rust', 'Solidity'], stars: 8940, forks: 1970, topics: ['toolchain', 'testing', 'evm'], license: 'MIT', updated: '2026-09-06', status: 'Accepted' },
      { id: 'viem', org: 'wevm', name: 'viem', description: 'TypeScript interface for EVM chains with low-level primitives and ABI types.', languages: ['TypeScript'], stars: 3410, forks: 812, topics: ['client', 'typescript', 'abi'], license: 'MIT', updated: '2026-09-05', status: 'Accepted' },
      { id: 'oz', org: 'OpenZeppelin', name: 'openzeppelin-contracts', description: 'Audited, community-reviewed building blocks for smart contract development.', languages: ['Solidity', 'JavaScript'], stars: 25600, forks: 11800, topics: ['security', 'library', 'solidity'], license: 'MIT', updated: '2026-09-02', status: 'Accepted' },
      { id: 'safe', org: 'safe-global', name: 'safe-smart-account', description: 'Modular smart account contracts for programmable custody and recovery.', languages: ['Solidity', 'TypeScript'], stars: 1890, forks: 964, topics: ['accounts', 'custody', 'multisig'], license: 'LGPL-3.0', updated: '2026-08-30', status: 'Accepted' },
      { id: 'alloy', org: 'alloy-rs', name: 'alloy', description: 'High-performance Rust libraries for building on EVM networks.', languages: ['Rust'], stars: 1240, forks: 398, topics: ['rust', 'rpc', 'primitives'], license: 'MIT', updated: '2026-09-06', status: 'Accepted' },
    ],
    waves: [
      { id: '4', number: 4, start: '2026-10-01', end: '2026-10-08', budget: 25000, status: 'Upcoming' },
      { id: '3', number: 3, start: '2026-09-01', end: '2026-09-08', budget: 25000, status: 'Active' },
      { id: '2', number: 2, start: '2026-08-01', end: '2026-08-08', budget: 20000, status: 'Completed' },
      { id: '1', number: 1, start: '2026-07-01', end: '2026-07-08', budget: 15000, status: 'Completed' },
    ],
    issues: [
      { id: '412', repoId: 'stablecoin', waveId: '3', title: 'Normalise revert reasons across transfer paths', description: 'transfer, transferFrom and the permit path each revert with a differently shaped error. Move them onto shared custom errors so integrators can branch on a stable selector.', criteria: ['Define custom errors covering every revert in the transfer surface.', 'Keep selectors stable and document them on the interface.', 'Assert the selector for each failure mode in tests.'], complexity: 'Medium', created: '2026-09-05' },
      { id: '707', repoId: 'alloy', waveId: '3', title: 'Add a resilient log subscription with replay', description: 'Long-lived log subscriptions drop events when the websocket reconnects. Add a wrapper that tracks a block cursor and backfills the gap on resume.', criteria: ['Track a cursor and backfill missed blocks after a reconnect.', 'Deduplicate events by block hash and log index.', 'Cover it with a test that severs the socket mid-stream.'], complexity: 'High', created: '2026-09-04' },
      { id: '706', repoId: 'alloy', waveId: '3', title: 'Document the provider migration path', description: 'Write the upgrade guide for moving off the previous provider API, including which traits changed and which shims exist.', criteria: ['List every breaking change with a before and after example.', 'Note which shims exist and when they will be removed.', 'Verify each snippet compiles against the current release.'], complexity: 'Trivial', created: '2026-09-03' },
      { id: '128', repoId: 'viem', waveId: '3', title: 'Improve the error surface for failed simulations', description: 'Simulation failures collapse into a generic error. Preserve the decoded revert data and the originating call so callers can act on it.', criteria: ['Decode revert data against the supplied ABI when available.', 'Keep the original call parameters on the thrown error.', 'Add type tests covering the new error shape.'], complexity: 'Medium', created: '2026-09-03' },
      { id: '94', repoId: 'safe', waveId: '3', title: 'Extend guard tests for module execution edge cases', description: 'Guard coverage misses repeated execution attempts, delegate-call restrictions, and threshold changes mid-transaction.', criteria: ['Cover each guard hook against every execution entry point.', 'Assert a disabled module cannot re-enter execution.', 'Document the threshold-change behaviour under test.'], complexity: 'High', created: '2026-09-02' },
      { id: '156', repoId: 'oz', waveId: '3', title: 'Tighten ERC-4626 rounding documentation', description: 'The rounding direction on deposit and withdraw is correct but under-documented, and integrators keep getting it wrong.', criteria: ['State the rounding direction for every public entry point.', 'Add a worked example covering the share-price edge case.', 'Link the relevant invariant tests from the docs.'], complexity: 'Trivial', created: '2026-09-02' },
      { id: '63', repoId: 'foundry', waveId: '3', title: 'Explain the empty coverage report', description: 'Running coverage on a project with no tests prints an empty table and no explanation of what to do next.', criteria: ['Explain why the report is empty and what to run instead.', 'Leave machine-readable output unchanged.', 'Cover both the terminal and lcov paths.'], complexity: 'Trivial', created: '2026-09-01' },
    ],
  };
}

export function readState(): State {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    const shapeOk = value?.version === 4
      && value.session && typeof value.session === 'object'
      && ['repos', 'waves', 'issues', 'applications', 'rewards'].every(k => Array.isArray(value[k]));
    if (shapeOk) return value;
  } catch { /* Unreadable storage starts a fresh preview. */ }
  return initialState();
}
