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

