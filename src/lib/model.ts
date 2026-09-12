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
  /** What the program announced it would pay, in whole USDC. */
  budget: number;
  status: 'Active' | 'Upcoming' | 'Completed';
  /**
   * Escrow mirror — the fields the wave pool contract tracks, in whole USDC so
   * the fixtures stay readable. `src/lib/wave-pool.ts` converts to stroops at the
   * boundary, which is the only place amounts are arithmetic.
   *
   * `escrowed` is what actually arrived, as opposed to `budget`, which is what was
   * promised: an upcoming wave is announced and unfunded, and a wave can close
   * underfunded and still pay out coherently.
   */
  escrowed: number;
  /** Paid out to contributors so far. Only moves once the wave has closed. */
  paid: number;
  /** Seconds a contributor has to claim after the wave closes. */
  claimWindow: number;
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
  version: 5;
  session: Session;
  repos: Repo[];
  waves: Wave[];
  issues: Issue[];
  applications: Application[];
  rewards: Reward[];
}

export const storageKey = 'surge-preview-v5';

/** Seconds in a week, for claim windows expressed in human terms. */
const WEEK = 7 * 24 * 60 * 60;

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
    version: 5,
    session: { contributor: null, maintainer: null },
    rewards: [],
    applications: [
      { issueId: '707', applicant: 'nadia.dev', status: 'Applied', message: 'I run an indexer that consumes these subscriptions in production and have handled reconnect storms before. Plan: a cursor per filter, backfill through getEvents on resume, dedupe on (ledgerSeq, index), and a test that severs the connection mid-stream.' },
      { issueId: '707', applicant: 'kwame-o', status: 'Applied', message: 'Happy to take this on. I would land the reconnect semantics and replay buffer first so it reviews on its own, document the config surface, then add backfill once the cursor behaviour is settled.' },
      { issueId: '94', applicant: 'lucia-m', status: 'Applied', message: 'Consensus testing is close to my day job. I will table-drive the nomination paths, add a guard test for double application, and pin the stalled-quorum behaviour with explicit fixtures.' },
      { issueId: '128', applicant: 'tobi.k', status: 'Applied', message: 'I would attach the diagnostic events to a dedicated error subclass, keep the original invocation on it, and add type-level tests so the shape cannot regress silently.' },
    ],
    repos: [
      { id: 'core', org: 'stellar', name: 'stellar-core', description: 'Reference implementation of the Stellar network protocol and consensus.', languages: ['C++', 'Rust'], stars: 3180, forks: 1010, topics: ['consensus', 'protocol', 'validator'], license: 'Apache-2.0', updated: '2026-09-04', status: 'Accepted' },
      { id: 'sorobansdk', org: 'stellar', name: 'rs-soroban-sdk', description: 'Rust SDK for writing smart contracts on Soroban.', languages: ['Rust'], stars: 1240, forks: 398, topics: ['soroban', 'contracts', 'rust'], license: 'Apache-2.0', updated: '2026-09-06', status: 'Accepted' },
      { id: 'jssdk', org: 'stellar', name: 'js-stellar-sdk', description: 'JavaScript and TypeScript client for Horizon and the Soroban RPC.', languages: ['TypeScript'], stars: 980, forks: 512, topics: ['client', 'typescript', 'horizon'], license: 'Apache-2.0', updated: '2026-09-05', status: 'Accepted' },
      { id: 'freighter', org: 'stellar', name: 'freighter', description: 'Browser wallet extension for signing Stellar and Soroban transactions.', languages: ['TypeScript'], stars: 640, forks: 218, topics: ['wallet', 'extension', 'signing'], license: 'Apache-2.0', updated: '2026-08-30', status: 'Accepted' },
      { id: 'blend', org: 'script3', name: 'blend-contracts', description: 'Soroban lending protocol contracts with isolated risk pools.', languages: ['Rust'], stars: 210, forks: 74, topics: ['defi', 'lending', 'soroban'], license: 'AGPL-3.0', updated: '2026-09-03', status: 'Accepted' },
      { id: 'fluttersdk', org: 'Soneso', name: 'stellar_flutter_sdk', description: 'Dart and Flutter SDK covering Horizon and Soroban.', languages: ['Dart'], stars: 180, forks: 62, topics: ['sdk', 'flutter', 'mobile'], license: 'MIT', updated: '2026-09-01', status: 'Accepted' },
    ],
    waves: [
      // Announced but not yet funded — the state a contributor sees before a wave
      // opens, and the one that proves `budget` and `escrowed` have to be separate.
      { id: '4', number: 4, start: '2026-10-01', end: '2026-10-08', budget: 25000, escrowed: 0, paid: 0, claimWindow: WEEK * 2, status: 'Upcoming' },
      // Funding still arriving mid-wave, so shares on screen are a projection.
      { id: '3', number: 3, start: '2026-09-01', end: '2026-09-08', budget: 25000, escrowed: 18000, paid: 0, claimWindow: WEEK * 2, status: 'Active' },
      // Closed and fully claimed, bar the rounding dust flooring leaves behind.
      { id: '2', number: 2, start: '2026-08-01', end: '2026-08-08', budget: 20000, escrowed: 20000, paid: 19999, claimWindow: WEEK * 2, status: 'Completed' },
      // Closed underfunded, and with a share nobody came back for.
      { id: '1', number: 1, start: '2026-07-01', end: '2026-07-08', budget: 15000, escrowed: 12000, paid: 9000, claimWindow: WEEK * 2, status: 'Completed' },
    ],
    issues: [
      { id: '412', repoId: 'sorobansdk', waveId: '3', title: 'Normalise contract error reporting across host calls', description: 'Storage, auth and token host calls each surface failures in a differently shaped error. Move them onto a shared error enum so integrators can branch on a stable variant.', criteria: ['Define a shared error enum covering every fallible host call.', 'Keep discriminants stable and document them on the trait.', 'Assert the variant for each failure mode in tests.'], complexity: 'Medium', created: '2026-09-05' },
      { id: '707', repoId: 'jssdk', waveId: '3', title: 'Add a resilient event subscription with ledger replay', description: 'Long-lived event subscriptions silently drop entries when the RPC connection resets. Add a wrapper that tracks a ledger cursor and backfills the gap on resume.', criteria: ['Track a ledger cursor and backfill missed ledgers after a reconnect.', 'Deduplicate events by ledger sequence and event index.', 'Cover it with a test that severs the connection mid-stream.'], complexity: 'High', created: '2026-09-04' },
      { id: '706', repoId: 'jssdk', waveId: '3', title: 'Document the Horizon to Soroban RPC migration path', description: 'Write the upgrade guide for callers moving off Horizon endpoints, including which methods moved and which shims exist.', criteria: ['List every moved endpoint with a before and after example.', 'Note which shims exist and when they will be removed.', 'Verify each snippet runs against the current release.'], complexity: 'Trivial', created: '2026-09-03' },
      { id: '128', repoId: 'freighter', waveId: '3', title: 'Improve the error surface for failed simulations', description: 'Simulation failures collapse into a generic error before the user ever sees the cause. Preserve the diagnostic events and the originating invocation so the interface can act on them.', criteria: ['Surface diagnostic events returned by simulation.', 'Keep the original invocation on the thrown error.', 'Add tests covering the new error shape.'], complexity: 'Medium', created: '2026-09-03' },
      { id: '94', repoId: 'core', waveId: '3', title: 'Extend tests for ledger close edge cases', description: 'Coverage misses repeated close attempts under validator disagreement, and the boundary where a ledger is nominated but never externalised.', criteria: ['Cover each nomination and externalisation path.', 'Assert a ledger cannot be applied twice.', 'Document the behaviour under a stalled quorum.'], complexity: 'High', created: '2026-09-02' },
      { id: '156', repoId: 'blend', waveId: '3', title: 'Tighten the pool rounding documentation', description: 'The rounding direction on supply and withdraw is correct but under-documented, and integrators keep getting it wrong.', criteria: ['State the rounding direction for every public entry point.', 'Add a worked example covering the smallest-unit edge case.', 'Link the relevant tests from the docs.'], complexity: 'Trivial', created: '2026-09-02' },
      { id: '63', repoId: 'fluttersdk', waveId: '3', title: 'Explain the empty transaction history result', description: 'Querying an account with no transactions returns an empty list and no explanation of what to do next.', criteria: ['Explain why the result is empty and what to try instead.', 'Leave the returned shape unchanged.', 'Cover both the paged and single-shot paths.'], complexity: 'Trivial', created: '2026-09-01' },
    ],
  };
}

export function readState(): State {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    const shapeOk = value?.version === 5
      && value.session && typeof value.session === 'object'
      && ['repos', 'waves', 'issues', 'applications', 'rewards'].every(k => Array.isArray(value[k]));
    if (shapeOk) return value;
  } catch { /* Unreadable storage starts a fresh preview. */ }
  return initialState();
}
