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
