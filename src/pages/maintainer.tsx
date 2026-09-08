import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, Check, Clock, Plus, ShieldCheck, Star, X,
} from 'lucide-react';
import {
  applicantName, dateLabel, isOwnApplication, pointsFor, repoName, reposOwnedBy,
  type Application, type Repo,
} from '../lib/model';
import { useApp } from '../lib/store';
import { PROGRAM } from '../lib/program';
import { Avatar, Chip, EASE, Empty, Item, ModalHost, Page, PageHead, Stagger } from '../components/ui';

const STATUS_TONE: Record<Repo['status'], string> = { Pending: 'warn', Accepted: 'ok', Rejected: 'bad' };

/* --------------------------------------------------------- repository list */

export function MaintainerHome() {
  const { state, setState, notify } = useApp();
  const me = state.session.maintainer!;
  const mine = reposOwnedBy(state.repos, me);

  // No backend reviewer exists in the preview, so review is an explicit action.
  const review = (id: string, decision: 'Accepted' | 'Rejected') => {
    setState(s => ({
      ...s,
      repos: s.repos.map(r => r.id === id ? {
        ...r,
        status: decision,
        reviewNote: decision === 'Accepted'
          ? 'Approved for the program.'
          : 'Not accepted. Scope the README and resubmit.',
      } : r),
    }));
    notify(decision === 'Accepted' ? 'Repository accepted. Its dashboard is now open.' : 'Repository rejected.');
  };

  if (!mine.length) {
    return (
      <Page>
        <PageHead title="Your repositories" sub="Submit a repository to open its dashboard." />
        <div className="gate">
          <span className="gate-icon"><Plus size={20} /></span>
          <h2>Nothing submitted yet</h2>
          <p className="muted">
            A repository has to be submitted and accepted into the program before its dashboard opens.
            Review usually takes one wave cycle.
          </p>
          <Link className="btn primary lg" to="/maintainer/submit">Submit a repository<ArrowRight size={14} /></Link>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHead
        title="Your repositories"
        sub="Each accepted repository gets its own dashboard."
        action={<Link className="btn primary sm" to="/maintainer/submit"><Plus size={14} />Submit</Link>}
      />
      <Stagger className="grid c2">
        {mine.map(repo => {
          const gated = repo.status !== 'Accepted';
          const issues = state.issues.filter(i => i.repoId === repo.id).length;
          return (
            <Item key={repo.id} className={gated ? 'card repo-card gated' : 'card repo-card'}>
              <div className="row" style={{ gap: 9 }}>
                <Avatar name={repo.org} org={repo.org} square size="lg" />
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span className="row-title">{repo.name}</span>
                  <span className="row-sub">{repo.org}</span>
                </span>
                <span className="spacer" />
                <Chip tone={STATUS_TONE[repo.status]}>{repo.status}</Chip>
              </div>

              <p className="muted repo-desc">{repo.description}</p>

              {repo.status === 'Accepted' ? (
                <>
                  <div className="row repo-stats">
                    <span className="dim"><span className="num">{issues}</span> issues</span>
                    <span className="dim row" style={{ gap: 4 }}><Star size={12} /><span className="num">{repo.stars}</span></span>
                  </div>
                  <Link className="btn primary sm block" to={`/maintainer/repo/${repo.id}`}>
                    Open dashboard<ArrowRight size={13} />
                  </Link>
                </>
              ) : (
                <>
                  <div className="note">
                    {repo.status === 'Pending' ? <Clock size={14} /> : <X size={14} />}
                    <span>
                      {repo.status === 'Pending'
                        ? 'In review. The dashboard opens once this repository is accepted.'
                        : repo.reviewNote ?? 'Not accepted into the program.'}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => review(repo.id, 'Accepted')}>
                      <ShieldCheck size={13} />Simulate acceptance
                    </button>
                    {repo.status === 'Pending' && (
                      <button className="btn sm ghost" onClick={() => review(repo.id, 'Rejected')}>Reject</button>
                    )}
                  </div>
                </>
              )}
            </Item>
          );
        })}
      </Stagger>
      <p className="hint gate-hint">
        Review is simulated locally — there is no program reviewer in this preview.
      </p>
    </Page>
  );
}

