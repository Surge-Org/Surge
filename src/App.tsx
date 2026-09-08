import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams,
} from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, Compass, FolderGit2, GitPullRequest, LayoutGrid, ListChecks, Menu, Moon,
  Settings, Sun, Trophy, Wrench, X,
} from 'lucide-react';
import { Provider, useApp } from './lib/store';
import { canOpenRepoDashboard, formatMoney, repoName, reposOwnedBy } from './lib/model';
import { PROGRAM } from './lib/program';
import { Avatar, Brand, EASE } from './components/ui';
import { GooeyNav } from './components/bits';
import { Landing } from './pages/landing';
import { Explore } from './pages/explore';
import { IssuePage } from './pages/issue';
import { ContributorLogin, MaintainerLogin } from './pages/auth';
import { ContributorWork, ContributorPoints, ContributorSettings } from './pages/contributor';
import { MaintainerHome, MaintainerSubmit, RepoDashboard, RepoIssues, RepoSettings } from './pages/maintainer';

/* ------------------------------------------------------------------ theme */

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('surge-theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('surge-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme] as const;
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <button
      className="btn ghost icon sm"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -50, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: EASE }}
        style={{ display: 'grid', placeItems: 'center' }}
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </motion.span>
    </button>
  );
}

/* ------------------------------------------------------- public top-nav shell */

function AnnounceBar() {
  const { state } = useApp();
  const [open, setOpen] = useState(true);
  const wave = state.waves.find(w => w.status === 'Active');
  if (!open || !wave) return null;
  return (
    <div className="announce">
      <Link className="announce-in" to="/explore">
        <span className="announce-tag">New</span>
        <span className="announce-text">
          Wave {wave.number} is open — ${formatMoney(wave.budget)} {PROGRAM.asset} across{' '}
          {state.issues.length} scoped issues
        </span>
        <ArrowRight size={12} />
      </Link>
      <button className="announce-x" aria-label="Dismiss announcement" onClick={() => setOpen(false)}>
        <X size={13} />
      </button>
    </div>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const [lifted, setLifted] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMenu(false); }, [location.pathname]);
  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The announcement bar is dismissible, so the header height is measured
  // rather than hard-coded; the hero fills whatever is left of the viewport.
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--top-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--top-h'); };
  }, []);

  const nav = [
    { to: '/explore', label: 'Explore', end: true },
    { to: '/explore/repos', label: 'Repositories' },
    { to: '/explore/orgs', label: 'Organizations' },
  ];

  return (
    <div className="public">
      <div className="public-top" ref={topRef}>
      <AnnounceBar />
      <div className="navpill-wrap">
        <header className={lifted ? 'navpill lifted' : 'navpill'}>
          <Brand />
          <div className="navpill-nav"><GooeyNav items={nav} /></div>
          <div className="navpill-right">
            <ThemeToggle />
            <Link className="btn sm" to="/maintainer/login">Submit your repo</Link>
            {state.session.contributor ? (
              <Link className="btn sm navpill-cta" to="/me">
                <Avatar name={state.session.contributor} />
                <span className="hide-sm">{state.session.contributor}</span>
              </Link>
            ) : (
              <Link className="btn sm navpill-cta" to={`/login?next=${encodeURIComponent(location.pathname)}`}>
                Sign up
              </Link>
            )}
            <button className="btn ghost icon sm navpill-burger" aria-label="Open menu" onClick={() => setMenu(m => !m)}>
              {menu ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </header>

        <AnimatePresence>
          {menu && (
            <motion.nav
              className="navpill-sheet"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <div className="navpill-sheet-in">
                {nav.map(n => (
                  <NavLink key={n.to} to={n.to} end={n.end}
                    className={({ isActive }) => (isActive ? 'on' : '')}>
                    {n.label}
                  </NavLink>
                ))}
                <Link to="/maintainer/login">Submit your repo</Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
      </div>
      {children}
    </div>
  );
}

