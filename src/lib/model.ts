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

