import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, GitPullRequest } from 'lucide-react';
import { applicantName, isOwnApplication, pointsFor, repoName } from '../lib/model';
import { useApp } from '../lib/store';
import { Avatar, Chip, Crumbs, Empty, ModalHost, Page } from '../components/ui';

export function IssuePage() {
  const { issueId } = useParams();
  const { state, setState, notify } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');

  const issue = state.issues.find(i => i.id === issueId);
  if (!issue) return <Navigate to="/explore" replace />;

  const repo = state.repos.find(r => r.id === issue.repoId)!;
  const wave = state.waves.find(w => w.id === issue.waveId)!;
  const me = state.session.contributor;
  const proposals = state.applications.filter(a => a.issueId === issue.id);
  const mine = proposals.find(isOwnApplication);
  const taken = proposals.find(a => ['Assigned', 'PR submitted', 'Accepted'].includes(a.status));
  const canApply = !mine && !taken && wave.status === 'Active';

  const submit = () => {
    if (message.trim().length < 30) { setErr('Add at least 30 characters so the maintainer can judge your plan.'); return; }
    setState(s => ({
      ...s,
      applications: [...s.applications, { issueId: issue.id, message: message.trim(), status: 'Applied' }],
    }));
    setOpen(false);
    setMessage('');
    notify('Proposal sent. Track it in your workspace.');
  };

  const startApply = () => {
    if (!me) { navigate(`/login?next=${encodeURIComponent(`/issue/${issue.id}`)}`); return; }
    setErr('');
    setOpen(true);
  };

  const label = mine
    ? (mine.status === 'Rejected' ? 'Not selected' : `Proposal ${mine.status.toLowerCase()}`)
    : taken ? 'Already assigned'
      : wave.status === 'Active' ? 'Apply to this issue' : 'Applications closed';

  return (
    <Page className="detail">
      <div className="detail-inner">
        <Crumbs items={[{ label: 'Explore', to: '/explore' }, { label: repoName(repo), to: `/explore?q=${encodeURIComponent(repo.name)}` }, { label: `#${issue.id}` }]} />

        <div className="detail-grid">
          <article>
            <header className="detail-head">
              <div className="row wrap" style={{ gap: 6 }}>
                <Chip className="solid num">{pointsFor(issue.complexity)} pts</Chip>
                <Chip>{issue.complexity}</Chip>
                <Chip tone={wave.status === 'Active' ? 'ok' : ''}>Wave {wave.number}</Chip>
              </div>
              <h1>{issue.title}</h1>
              <div className="row dim" style={{ gap: 7, fontSize: 'var(--t3)' }}>
                <Avatar name={repo.org} org={repo.org} square />
                <span>{repoName(repo)}</span>
              </div>
            </header>

            <section className="prose">
              <h2>Description</h2>
              <p>{issue.description}</p>
              <h2>Acceptance criteria</h2>
              <ul className="criteria">
                {issue.criteria.map(c => <li key={c}><Check size={13} /><span>{c}</span></li>)}
              </ul>
            </section>

            <section className="proposals">
              <div className="row" style={{ marginBottom: 'var(--s3)' }}>
                <h2>Proposals</h2>
                <Chip className="num">{proposals.length}</Chip>
                <span className="spacer" />
                <button className="btn primary sm" disabled={!canApply} onClick={startApply}>{label}</button>
              </div>
              {proposals.length ? (
                <div className="list">
                  {proposals.map(p => (
                    <div className="proposal" key={`${p.issueId}-${p.applicant ?? 'me'}`}>
                      <div className="row" style={{ gap: 8 }}>
                        <Avatar name={applicantName(p, me ?? '?')} />
                        <strong className="row-title">{applicantName(p, me ?? 'You')}</strong>
                        {isOwnApplication(p) && <Chip>You</Chip>}
                        <span className="spacer" />
                        <Chip tone={p.status === 'Accepted' ? 'ok' : p.status === 'Rejected' ? 'bad' : p.status === 'Applied' ? '' : 'warn'}>
                          {p.status}
                        </Chip>
                      </div>
                      <p className="muted proposal-body">{p.message}</p>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No proposals yet">Be the first to send a plan for this issue.</Empty>}
            </section>
          </article>

          <aside className="detail-side">
            <div className="card side-card">
              <p className="label">Points</p>
              <div className="side-row"><span className="muted">Base</span><span className="num">100</span></div>
              <div className="side-row"><span className="muted">Complexity</span><span className="num">+{pointsFor(issue.complexity) - 100}</span></div>
              <div className="side-row total"><span>Total</span><span className="num">{pointsFor(issue.complexity)}</span></div>
            </div>
            <div className="card side-card">
              <p className="label">Repository</p>
              <Link className="row side-link" to={`/explore?q=${encodeURIComponent(repo.name)}`}>
                <Avatar name={repo.org} org={repo.org} square size="lg" />
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span className="row-title">{repo.name}</span>
                  <span className="row-sub">{repo.org}</span>
                </span>
              </Link>
              <a className="btn sm block" href={`https://github.com/${repoName(repo)}`} target="_blank" rel="noreferrer">
                View on GitHub<ArrowUpRight size={12} />
              </a>
            </div>
            <div className="card side-card">
              <p className="label">Assigned</p>
              <p className="muted">{taken ? applicantName(taken, me ?? 'You') : 'Nobody yet'}</p>
              {taken?.pr && (
                <a className="row side-link" href={taken.pr} target="_blank" rel="noreferrer">
                  <GitPullRequest size={13} />Pull request
                </a>
              )}
            </div>
          </aside>
        </div>
      </div>

      <ModalHost open={open} title="Apply to this issue" onClose={() => setOpen(false)}>
        <p>{issue.title}</p>
        <label className="field">
          <span>Your plan</span>
          <textarea
            className="textarea"
            rows={6}
            autoFocus
            aria-label="Your plan"
            placeholder="How would you approach this? Mention relevant experience and how you would verify it."
            value={message}
            onChange={e => { setMessage(e.target.value); if (err) setErr(''); }}
          />
        </label>
        {err ? <p className="err" role="alert">{err}</p> : <p className="hint">At least 30 characters.</p>}
        <button className="btn primary block" onClick={submit}>Send proposal</button>
      </ModalHost>
    </Page>
  );
}
