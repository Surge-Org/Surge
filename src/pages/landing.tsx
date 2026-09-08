import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, GitPullRequest, Layers,
  Scale, ShieldCheck, Sparkles, Timer,
} from 'lucide-react';
import { dateLabel, formatCount, formatMoney, pointsFor, relativeDate, repoName } from '../lib/model';
import { PROGRAM } from '../lib/program';
import { useApp } from '../lib/store';
import { Avatar, Chip, EASE, Item, Stagger } from '../components/ui';
import {
  AnimatedContent, Aurora, ClickSpark, CountUp, GlareHover, GradientText,
  Magnet, RotatingText, ScrollProgress, SplitText, StarBorder,
} from '../components/bits';
import { MoltenMetal } from '../components/bits';
import { Lanyard, LogoLoop } from '../components/bits';
import { FanSection, LiveStackSection, SpiralSection, TeamSection } from './sections';

const STEPS = [
  { n: '01', t: 'A wave opens', d: `A funded sprint starts with a fixed ${PROGRAM.asset} pool and a one-week window.`, icon: Timer },
  { n: '02', t: 'Maintainers scope', d: 'Accepted repositories post issues with acceptance criteria and a point value.', icon: ShieldCheck },
  { n: '03', t: 'You apply', d: 'Send a short plan. The maintainer picks exactly one candidate per issue.', icon: GitPullRequest },
  { n: '04', t: 'Work is settled', d: 'Accepted work earns points; points split the pool when the wave closes.', icon: Scale },
];

const TIERS = [
  { level: 'Trivial' as const, blurb: 'Docs, empty states, a focused accessibility pass.' },
  { level: 'Medium' as const, blurb: 'Feature work with tests and a clear behavioural contract.' },
  { level: 'High' as const, blurb: 'Protocol edges, migrations, infrastructure changes.' },
];

const FAQS = [
  { q: 'What exactly is a wave?', a: `A time-boxed sprint with its own ${PROGRAM.asset} pool. Maintainers add scoped issues, contributors apply and get assigned, and the wave closes once assigned work has been reviewed.` },
  { q: 'How many issues can I take at once?', a: 'Three concurrent assignments. A slot is occupied from assignment until your contribution is accepted. Unassigned applications do not consume a slot.' },
  { q: 'How do points become a payout?', a: 'Your accepted points divided by total accepted points, multiplied by the wave pool. It settles when the wave closes and is recorded as a grant.' },
  { q: 'What if my pull request is rejected?', a: 'No points are credited and the slot is released. Maintainers review against criteria published on the issue, so the bar is visible before you apply.' },
  { q: 'How does a repository join?', a: `Sign in through the maintainer area and submit it. Repositories are reviewed before joining the ${PROGRAM.full}, and each accepted repository gets its own dashboard.` },
  { q: 'Is this connected to real funds?', a: 'Not in this preview. Profiles, repositories, proposals and grants live in your browser only. GitHub sign-in, repository sync, wallets and transfers are not connected.' },
];

export function Landing() {
  const { state } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const accepted = state.repos.filter(r => r.status === 'Accepted');
  const wave = state.waves.find(w => w.status === 'Active');
  const pool = state.waves.filter(w => w.status !== 'Completed').reduce((s, w) => s + w.budget, 0);
  const featured = state.issues.slice(0, 5);
  const totalStars = accepted.reduce((s, r) => s + r.stars, 0);

  return (
    <ClickSpark>
      <ScrollProgress />

      {/* ------------------------------------------------------------- hero */}
      <section className="hero">
        <MoltenMetal />
        <span className="metal-veil" aria-hidden="true" />
        <div className="hero-inner">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {wave && (
              <StarBorder className="hero-badge">
                <span className="hero-badge-in">
                  <span className="dot-live" />
                  Wave {wave.number} open
                  <span className="dim">·</span>
                  ${formatMoney(wave.budget)} {PROGRAM.asset}
                </span>
              </StarBorder>
            )}

            <h1 className="hero-title">
              <SplitText text={`Build ${PROGRAM.chain},`} />
              <br />
              <GradientText>get paid for it.</GradientText>
            </h1>

            <p className="hero-sub">
              The {PROGRAM.full} funds work on the repositories {PROGRAM.chain} depends on.
              Maintainers post issues with a point value, contributors apply with a plan, and
              accepted work splits the wave pool in {PROGRAM.asset}.
            </p>

            <p className="hero-rotate">
              Built for{' '}
              <RotatingText words={['protocol engineers', 'Rust maintainers', 'contract auditors', 'TypeScript devs']} />
            </p>

            <div className="row wrap hero-cta">
              <Magnet>
                <Link className="btn lg primary glow" to="/explore">
                  <GlareHover><span className="row" style={{ gap: 6 }}>Explore issues<ArrowRight size={15} /></span></GlareHover>
                </Link>
              </Magnet>
              <Link className="btn lg" to="/explore/repos">Browse repositories</Link>
            </div>

            <div className="hero-meta">
              <span><CountUp to={state.issues.length} /> open issues</span>
              <span className="sep">·</span>
              <span><CountUp to={accepted.length} /> repositories</span>
              <span className="sep">·</span>
              <span><CountUp to={pool} prefix="$" /> {PROGRAM.asset} scheduled</span>
            </div>
          </motion.div>

          <motion.div
            className="hero-art"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: EASE }}
          >
            <Lanyard>
              <div className="badge-card">
                <span className="badge-hole" aria-hidden="true" />
                <span className="label badge-eyebrow">Contributor pass</span>
                <p className="badge-name">Wave {wave?.number ?? '—'}</p>
                <p className="badge-role">{PROGRAM.full}</p>
                <div className="badge-rows">
                  <div className="badge-row"><span>Pool</span><span>${formatMoney(wave?.budget ?? 0)}</span></div>
                  <div className="badge-row"><span>Open issues</span><span>{state.issues.length}</span></div>
                  <div className="badge-row"><span>Repositories</span><span>{accepted.length}</span></div>
                </div>
                <div className="badge-strip">drag me</div>
              </div>
            </Lanyard>
          </motion.div>
        </div>
      </section>

      {/* --------------------------------------------------- repository strip */}
      <section className="strip">
        <p className="label strip-label">Repositories in the program</p>
        <LogoLoop speed={34}>
          {accepted.map(r => (
            <Link className="strip-item" to={`/explore?q=${encodeURIComponent(r.name)}`} key={r.id}>
              <Avatar name={r.org} org={r.org} square />
              <span className="col" style={{ gap: 0, minWidth: 0 }}>
                <span className="row-title">{r.name}</span>
                <span className="row-sub">{r.org}</span>
              </span>
            </Link>
          ))}
        </LogoLoop>
      </section>

      {/* ------------------------------------------- bento: what a wave runs on */}
      <section className="band alt">
        <div className="band-inner">
          <AnimatedContent>
            <div className="sec">
              <div>
                <h2>Everything a wave runs on</h2>
                <p>Scoping, claiming, review and settlement — each with its own guarantee.</p>
              </div>
              <Link className="btn" to="/explore">Explore issues<ArrowRight size={14} /></Link>
            </div>
          </AnimatedContent>

          <div className="bento">
            <AnimatedContent className="box w4 tall pad-lg">
              <span className="box-icon"><Layers size={18} /></span>
              <h3>A funded sprint, opened on a schedule</h3>
              <p>
                Every wave runs for one week against a fixed {PROGRAM.asset} pool. Nothing is
                renegotiated mid-flight — the pool, the window and the point values are all
                published before the first issue is claimed.
              </p>
              <span className="spacer" />
              <div className="box-preview">
                {state.waves.slice().reverse().slice(1).map(w => (
                  <div className="mini-row" key={w.id}>
                    <span className={`wave-dot ${w.status.toLowerCase()}`} />
                    <span className="col" style={{ gap: 1, minWidth: 0, flex: 1 }}>
                      <span className="row-title">Wave {w.number}</span>
                      <span className="row-sub">{dateLabel(w.start)} – {dateLabel(w.end)}</span>
                    </span>
                    <span className="row-title num hide-sm">${formatMoney(w.budget)}</span>
                    <Chip tone={w.status === 'Active' ? 'ok' : ''}>{w.status}</Chip>
                  </div>
                ))}
              </div>
            </AnimatedContent>

            <AnimatedContent className="box w2 tall" delay={0.06}>
              <span className="big-num acc"><CountUp to={state.issues.length} /></span>
              <h3>Scoped issues</h3>
              <p>Each carries acceptance criteria and a fixed point value before it is listed.</p>
              <span className="spacer" />
              <Link className="btn sm" to="/explore">Browse<ArrowRight size={13} /></Link>
            </AnimatedContent>

            <AnimatedContent className="box w2" delay={0.1}>
              <span className="big-num"><CountUp to={accepted.length} /></span>
              <h3>Repositories</h3>
              <p>Reviewed and accepted into the program.</p>
            </AnimatedContent>

            <AnimatedContent className="box w2" delay={0.14}>
              <span className="big-num">{formatCount(totalStars)}</span>
              <h3>Stars</h3>
              <p>Across every participating repository.</p>
            </AnimatedContent>

            <AnimatedContent className="box w2" delay={0.18}>
              <span className="big-num acc"><CountUp to={pool} prefix="$" /></span>
              <h3>{PROGRAM.asset} scheduled</h3>
              <p>Committed across the currently open waves.</p>
            </AnimatedContent>
          </div>
        </div>
      </section>

      <LiveStackSection issues={state.issues} repos={state.repos} />

      {/* -------------------------------------------------------- open right now */}
      <section className="band">
        <div className="band-inner">
          <AnimatedContent>
            <div className="sec">
              <div>
                <h2>Open right now</h2>
                <p>Every issue is scoped by its maintainer before it reaches this list.</p>
              </div>
              <Link className="btn" to="/explore">All issues<ArrowRight size={14} /></Link>
            </div>
          </AnimatedContent>
          <Stagger className="list">
            {featured.map(issue => {
              const repo = state.repos.find(r => r.id === issue.repoId);
              return (
                <Item key={issue.id}>
                  <Link className="list-row" to={`/issue/${issue.id}`}>
                    <span className="mono dim issue-num">#{issue.id}</span>
                    <span className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                      <span className="row-title">{issue.title}</span>
                      <span className="row-sub">{repo ? repoName(repo) : ''}</span>
                    </span>
                    <Chip className="hide-sm">{issue.complexity}</Chip>
                    <Chip className="solid num">{pointsFor(issue.complexity)}</Chip>
                    <ArrowUpRight size={14} className="dim" />
                  </Link>
                </Item>
              );
            })}
          </Stagger>
        </div>
      </section>

      <FanSection />

      {/* ------------------------------------------------------------ four steps */}
      <section className="band alt">
        <div className="band-inner">
          <AnimatedContent>
            <div className="sec">
              <div>
                <h2>From scoping to settlement</h2>
                <p>Four steps, and the rules do not change once a wave is open.</p>
              </div>
            </div>
          </AnimatedContent>
          <div className="bento">
            {STEPS.map((step, i) => (
              <AnimatedContent className="box w3" key={step.n} delay={i * 0.07}>
                <div className="row">
                  <span className="box-icon"><step.icon size={18} /></span>
                  <span className="spacer" />
                  <span className="big-num step-num">{step.n}</span>
                </div>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
              </AnimatedContent>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- point tiers */}
      <section className="band">
        <div className="band-inner">
          <AnimatedContent>
            <div className="sec">
              <div>
                <h2>Points, not negotiation</h2>
                <p>Complexity sets the points. Points set your share of the pool.</p>
              </div>
              <Link className="btn" to="/explore">See open issues<ArrowRight size={14} /></Link>
            </div>
          </AnimatedContent>

          <div className="bento">
            {TIERS.map((t, i) => (
              <AnimatedContent className="box w2" key={t.level} delay={i * 0.07}>
                <span className="box-kicker">{t.level}</span>
                <span className="big-num acc"><CountUp to={pointsFor(t.level)} /></span>
                <div className="tier-bar">
                  <motion.span
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: pointsFor(t.level) / pointsFor('High') }}
                    viewport={{ once: true, margin: '-10% 0px' }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                  />
                </div>
                <p>{t.blurb}</p>
              </AnimatedContent>
            ))}

            <AnimatedContent className="box w6 pad-lg" delay={0.1}>
              <span className="label">How your share is calculated</span>
              <div className="formula">
                <span className="formula-part acc">your accepted points</span>
                <span className="formula-op">÷</span>
                <span className="formula-part">total accepted points</span>
                <span className="formula-op">×</span>
                <span className="formula-part">wave pool</span>
              </div>
              <ul className="ticks">
                <li><Check size={14} />Every issue starts at 100 base points, plus a complexity bonus.</li>
                <li><Check size={14} />Points credit only once a maintainer accepts the work.</li>
                <li><Check size={14} />Your share settles as a grant when the wave closes.</li>
              </ul>
            </AnimatedContent>
          </div>
        </div>
      </section>

      <SpiralSection repos={accepted} />
