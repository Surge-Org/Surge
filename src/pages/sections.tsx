import { Link } from 'react-router-dom';
import { ArrowRight, GitPullRequest, Send, Wallet } from 'lucide-react';
import { formatCount, pointsFor, relativeDate, repoName, type Issue, type Repo } from '../lib/model';
import { PROGRAM } from '../lib/program';
import { Avatar, Chip } from '../components/ui';
import { AnimatedContent, BounceCards, CardSwap, InfiniteSpiral, ProfileCard } from '../components/bits';

/** Stacked issue cards that cycle, so the backlog reads as live. */
export function LiveStackSection({ issues, repos }: { issues: Issue[]; repos: Repo[] }) {
  const cards = issues.slice(0, 4).map(issue => {
    const repo = repos.find(r => r.id === issue.repoId);
    return {
      id: issue.id,
      node: (
        <Link className="stack-card" to={`/issue/${issue.id}`}>
          <div className="row">
            <Chip className="solid num">{pointsFor(issue.complexity)} pts</Chip>
            <Chip>{issue.complexity}</Chip>
            <span className="spacer" />
            <span className="mono dim" style={{ fontSize: 'var(--t2)' }}>#{issue.id}</span>
          </div>
          <h3 className="stack-title">{issue.title}</h3>
          <p className="stack-desc">{issue.description}</p>
          <div className="row stack-foot">
            {repo && <Avatar name={repo.org} org={repo.org} square />}
            <span className="row-sub">{repo ? repoName(repo) : ''}</span>
            <span className="spacer" />
            <ArrowRight size={13} className="dim" />
          </div>
        </Link>
      ),
    };
  });

  return (
    <section className="band">
      <div className="band-inner split-wide">
        <AnimatedContent>
          <div>
            <h2 className="sec-h">The backlog, live</h2>
            <p className="muted band-copy">
              Issues cycle through the queue as maintainers scope them. Every card carries its point
              value and acceptance criteria before anyone claims it.
            </p>
            <Link className="btn" to="/explore">Open the board<ArrowRight size={14} /></Link>
          </div>
        </AnimatedContent>
        <AnimatedContent delay={0.1}>
          <CardSwap cards={cards} />
        </AnimatedContent>
      </div>
    </section>
  );
}

/** Three lifecycle cards that fan out on scroll. */
export function FanSection() {
  const cards = [
    { icon: Send, t: 'Apply', d: 'Send a short plan. No speculative pull requests.', tone: 'a' },
    { icon: GitPullRequest, t: 'Build', d: 'One assignee per issue, reviewed against published criteria.', tone: 'b' },
    { icon: Wallet, t: 'Get paid', d: `Accepted points split the wave pool in ${PROGRAM.asset}.`, tone: 'c' },
  ];
  return (
    <section className="band alt">
      <div className="band-inner">
        <AnimatedContent>
          <div className="sec centered-sec">
            <div>
              <h2>Three moves, start to settled</h2>
              <p>No bidding, no silent work, no negotiation over price.</p>
            </div>
          </div>
        </AnimatedContent>
        <BounceCards>
          {cards.map(c => (
            <div className={`fan-card tone-${c.tone}`} key={c.t}>
              <span className="fan-icon"><c.icon size={18} /></span>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </div>
          ))}
        </BounceCards>
      </div>
    </section>
  );
}

/** Repositories arranged on a rotating spiral. */
export function SpiralSection({ repos }: { repos: Repo[] }) {
  const items = repos.map(r => (
    <Link className="spiral-chip" to={`/explore?q=${encodeURIComponent(r.name)}`} key={r.id} title={repoName(r)}>
      <Avatar name={r.org} org={r.org} square />
      <span className="col" style={{ gap: 0, minWidth: 0 }}>
        <span className="row-title">{r.name}</span>
        <span className="row-sub">{formatCount(r.stars)} stars</span>
      </span>
    </Link>
  ));

  return (
    <section className="band">
      <div className="band-inner split-wide">
        <AnimatedContent delay={0.05}>
          <InfiniteSpiral items={items} />
        </AnimatedContent>
        <AnimatedContent>
          <div>
            <h2 className="sec-h">One program, every layer</h2>
            <p className="muted band-copy">
              Contracts, tooling, clients and libraries — the repositories {PROGRAM.chain} depends
              on are all in the same funded cycle, so work lands where it compounds.
            </p>
            <Link className="btn" to="/explore/repos">See repositories<ArrowRight size={14} /></Link>
          </div>
        </AnimatedContent>
      </div>
    </section>
  );
}

/** Program team, as tilting holographic cards. */
export function TeamSection({ repos }: { repos: Repo[] }) {
  const team = [
    { name: 'Nadia Osei', role: 'Program lead', handle: '@nadia.dev', org: repos[0]?.org, stat: '4 waves' },
    { name: 'Kwame Owusu', role: 'Reviewer, tooling', handle: '@kwame-o', org: repos[1]?.org, stat: '62 reviews' },
    { name: 'Lucía Marín', role: 'Reviewer, contracts', handle: '@lucia-m', org: repos[3]?.org, stat: '48 reviews' },
    { name: 'Tobi Kalu', role: 'Contributor advocate', handle: '@tobi.k', org: repos[2]?.org, stat: '110 issues' },
  ];

  return (
    <section className="band alt">
      <div className="band-inner">
        <AnimatedContent>
          <div className="sec centered-sec">
            <div>
              <h2>Who runs the waves</h2>
              <p>Reviewers and program staff who scope issues and settle each cycle.</p>
            </div>
          </div>
        </AnimatedContent>
        <div className="grid c4 team-grid">
          {team.map((m, i) => (
            <AnimatedContent key={m.handle} delay={i * 0.07}>
              <ProfileCard
                name={m.name}
                role={m.role}
                handle={m.handle}
                stat={m.stat}
                avatar={<Avatar name={m.name} org={m.org} square />}
              />
            </AnimatedContent>
          ))}
        </div>
        <p className="hint team-note">
          Sample program staff for this preview — not real people.
        </p>
      </div>
    </section>
  );
}

/** Recently updated repositories, for the freshness signal. */
export function FreshSection({ repos }: { repos: Repo[] }) {
  return (
    <div className="fresh">
      {repos.slice(0, 3).map(r => (
        <div className="mini-row" key={r.id}>
          <Avatar name={r.org} org={r.org} square />
          <span className="col" style={{ gap: 1, minWidth: 0, flex: 1 }}>
            <span className="row-title">{r.name}</span>
            <span className="row-sub">{r.updated ? `Updated ${relativeDate(r.updated)}` : r.org}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
