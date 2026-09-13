import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, GitPullRequest } from 'lucide-react';
import { awardedPoints, initialState, isOwnApplication, pointsFor, repoName } from '../lib/model';
import { PHASE_LABEL, PHASE_NOTE, claimable, contractWave, wavePhase } from '../lib/wave-pool';
import { useApp } from '../lib/store';
import { Chip, Empty, Item, ModalHost, Page, PageHead, Stagger } from '../components/ui';
import { Amount } from '../components/chain';

export function ContributorWork() {
  const { state, setState, notify } = useApp();
  const [prFor, setPrFor] = useState<string | null>(null);
  const [pr, setPr] = useState('');
  const [err, setErr] = useState('');

  const mine = state.applications.filter(isOwnApplication);
  const active = mine.filter(a => ['Assigned', 'PR submitted'].includes(a.status)).length;

  const submitPr = () => {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*\/?$/.test(pr.trim())) {
      setErr('Enter a GitHub pull request URL.');
      return;
    }
    setState(s => ({
      ...s,
      applications: s.applications.map(a =>
        a.issueId === prFor && isOwnApplication(a) ? { ...a, status: 'PR submitted', pr: pr.trim() } : a),
    }));
    setPrFor(null);
    setPr('');
    notify('Pull request submitted for review.');
  };

  return (
    <Page>
      <PageHead
        title="Assignments"
        sub={`${active} of 3 concurrent slots in use.`}
        action={<Link className="btn sm" to="/explore">Find issues<ArrowRight size={13} /></Link>}
      />
      {mine.length ? (
        <Stagger className="list">
          {mine.map(app => {
            const issue = state.issues.find(i => i.id === app.issueId);
            if (!issue) return null;
            const repo = state.repos.find(r => r.id === issue.repoId);
            return (
              <Item key={app.issueId}>
                <div className="list-row">
                  <span className="mono dim issue-num">#{issue.id}</span>
                  <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <Link className="row-title" to={`/issue/${issue.id}`}>{issue.title}</Link>
                    <span className="row-sub">{repo ? repoName(repo) : ''}</span>
                  </span>
                  <Chip tone={app.status === 'Accepted' ? 'ok' : app.status === 'Rejected' ? 'bad' : app.status === 'Applied' ? '' : 'warn'}>
                    {app.status}
                  </Chip>
                  {app.status === 'Assigned' && (
                    <button className="btn xs primary" onClick={() => { setErr(''); setPrFor(app.issueId); }}>
                      <GitPullRequest size={12} />Submit PR
                    </button>
                  )}
                </div>
              </Item>
            );
          })}
        </Stagger>
      ) : (
        <Empty title="No applications yet">
          Send a proposal from any open issue and it will appear here.
        </Empty>
      )}

      <ModalHost open={!!prFor} title="Submit your pull request" onClose={() => setPrFor(null)}>
        <p>Link the work you want reviewed.</p>
        <label className="field">
          <span>Pull request URL</span>
          <input className="input" type="url" autoFocus aria-label="Pull request URL"
            placeholder="https://github.com/owner/repo/pull/123"
            value={pr} onChange={e => { setPr(e.target.value); if (err) setErr(''); }} />
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary block" onClick={submitPr}>Submit for review</button>
      </ModalHost>
    </Page>
  );
}

export function ContributorPoints() {
  const { state } = useApp();
  const accepted = state.applications.filter(a => isOwnApplication(a) && a.status === 'Accepted');

  /** Points per wave, so a share can be computed against the right denominator. */
  const byWave = new Map<string, number>();
  for (const app of accepted) {
    const issue = state.issues.find(i => i.id === app.issueId);
    if (!issue) continue;
    byWave.set(issue.waveId, (byWave.get(issue.waveId) ?? 0) + pointsFor(issue.complexity));
  }
  const total = [...byWave.values()].reduce((sum, n) => sum + n, 0);

  /**
   * One row per wave this contributor has points in.
   *
   * A share is computed per wave and never across waves: each wave has its own pool
   * and its own denominator, so "points divided by all points ever" would not
   * correspond to any payout. `null` from `claimable` — a wave with no points
   * recorded — folds to zero for the totals, and the row's phase is what
   * distinguishes it from a genuine zero share.
   */
  const rows = state.waves
    .filter(wave => byWave.has(wave.id))
    .sort((a, b) => b.number - a.number)
    .map(wave => {
      const mine = byWave.get(wave.id)!;
      const chain = contractWave(wave, awardedPoints(wave, state));
      return {
        wave,
        chain,
        mine,
        share: claimable(chain, mine) ?? 0n,
        phase: wavePhase(chain),
      };
    });

  // Reduced rather than accumulated inside the map above: mutating a closure
  // variable during render is a React compiler error, and correctly so — the
  // component body can run more than once and the totals would double.
  const owed = rows.reduce((sum, r) => sum + r.share, 0n);
  const settled = rows.reduce((sum, r) => sum + (r.phase === 'paying' ? r.share : 0n), 0n);

  return (
    <Page>
      <PageHead
        title="Points"
        sub={<>Earned when a maintainer accepts your work, and paid as a share of each wave&rsquo;s pool.</>}
      />
      <div className="grid c3">
        <div className="card stat">
          <p className="label">Total points</p>
          <strong className="num">{total}</strong>
          <small>Across {byWave.size || 'no'} {byWave.size === 1 ? 'wave' : 'waves'}</small>
        </div>
        <div className="card stat">
          <p className="label">Claimable now</p>
          <strong><Amount stroops={settled} /></strong>
          <small>{settled > 0n ? 'Settled and waiting' : 'Nothing settled yet'}</small>
        </div>
        <div className="card stat">
          <p className="label">Including projections</p>
          <strong><Amount stroops={owed} /></strong>
          <small>Open waves still move</small>
        </div>
      </div>

      <section className="section">
        <div className="row section-head"><h2>By wave</h2></div>
        {rows.length ? (
          <Stagger className="list">
            {rows.map(({ wave, chain, mine, share, phase }) => (
              <Item key={wave.id}>
                <div className="list-row">
                  <span className="mono dim issue-num">#{wave.number}</span>
                  <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <strong className="row-title">Wave {wave.number}</strong>
                    <span className="row-sub">{PHASE_NOTE[phase]}</span>
                  </span>
                  <Chip tone={phase === 'paying' ? 'ok' : phase === 'expired' ? 'bad' : ''}>
                    {PHASE_LABEL[phase]}
                  </Chip>
                  <Chip className="num">
                    {mine} / {chain.total_points} pts
                  </Chip>
                  <strong><Amount stroops={share} /></strong>
                </div>
              </Item>
            ))}
          </Stagger>
        ) : <Empty title="No points yet">Points appear once a maintainer accepts your work.</Empty>}
      </section>

      <section className="section">
        <div className="row section-head"><h2>Accepted work</h2></div>
        {accepted.length ? (
          <Stagger className="list">
            {accepted.map(a => {
              const issue = state.issues.find(i => i.id === a.issueId)!;
              return (
                <Item key={a.issueId}>
                  <div className="list-row">
                    <span className="mono dim issue-num">#{issue.id}</span>
                    <Link className="row-title" style={{ flex: 1, minWidth: 0 }} to={`/issue/${issue.id}`}>{issue.title}</Link>
                    <Chip className="solid num">+{pointsFor(issue.complexity)}</Chip>
                  </div>
                </Item>
              );
            })}
          </Stagger>
        ) : <Empty title="Nothing accepted yet">Submit a pull request from an assignment to earn points.</Empty>}
      </section>
    </Page>
  );
}

export function ContributorSettings() {
  const { state, setState, notify } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(state.session.contributor ?? '');
  const [confirm, setConfirm] = useState(false);

  return (
    <Page>
      <PageHead title="Settings" />
      <div className="card submit-form">
        <label className="field">
          <span>Display name</span>
          <input className="input" aria-label="Display name" maxLength={40}
            value={name} onChange={e => setName(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary sm" onClick={() => {
            if (!name.trim()) return;
            setState(s => ({ ...s, session: { ...s.session, contributor: name.trim() } }));
            notify('Profile saved.');
          }}>Save</button>
          <button className="btn ghost sm" onClick={() => {
            setState(s => ({ ...s, session: { ...s.session, contributor: null } }));
            notify('Signed out.');
            navigate('/explore');
          }}>Sign out</button>
        </div>
      </div>

      <div className="card submit-form">
        <div className="row">
          <span className="col" style={{ gap: 2 }}>
            <strong className="row-title">Reset preview data</strong>
            <span className="row-sub">Clears profiles, repositories, proposals, and points.</span>
          </span>
          <span className="spacer" />
          <button className="btn sm danger" onClick={() => setConfirm(true)}>Reset</button>
        </div>
      </div>

      <ModalHost open={confirm} title="Reset this preview?" onClose={() => setConfirm(false)}>
        <p>Everything stored locally is removed and the sample data comes back.</p>
        <button className="btn primary block" onClick={() => {
          setState(initialState());
          setConfirm(false);
          notify('Preview reset.');
          navigate('/');
        }}>Reset preview data</button>
      </ModalHost>
    </Page>
  );
}
