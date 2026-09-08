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

/* ----------------------------------------------------------- workspace shell */

interface NavEntry { to: string; label: string; icon: React.ElementType; end?: boolean; count?: number }

function Rail({ title, sub, groups, open, onClose, footer }: {
  title: string;
  sub?: string;
  groups: { heading: string; items: NavEntry[] }[];
  open: boolean;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <aside className={open ? 'rail open' : 'rail'} aria-label="Workspace navigation">
      <div className="rail-head">
        <Brand to="/" />
        <span className="spacer" />
        <button className="btn ghost icon xs rail-close" aria-label="Close menu" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="rail-scope">
        <p className="label">{title}</p>
        {sub && <p className="rail-scope-sub">{sub}</p>}
      </div>
      <div className="rail-body">
        {groups.map(g => (
          <div className="rail-group" key={g.heading}>
            <p className="label">{g.heading}</p>
            {g.items.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose}
                className={({ isActive }) => (isActive ? 'nav-item on' : 'nav-item')}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="nav-bg" className="nav-bg"
                        transition={{ type: 'spring', stiffness: 460, damping: 38 }} />
                    )}
                    <item.icon />
                    <span>{item.label}</span>
                    {item.count !== undefined && <span className="nav-count">{item.count}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      {footer && <div className="rail-foot">{footer}</div>}
    </aside>
  );
}

function WorkspaceShell({ title, sub, groups, footer, children }: {
  title: string;
  sub?: string;
  groups: { heading: string; items: NavEntry[] }[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <div className="shell with-rail">
      <Rail title={title} sub={sub} groups={groups} open={open} onClose={() => setOpen(false)} footer={footer} />
      <AnimatePresence>
        {open && (
          <motion.button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
        )}
      </AnimatePresence>
      <header className="topbar">
        <button className="btn ghost icon sm menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu size={16} />
        </button>
        <span className="topbar-title">{sub ?? title}</span>
        <span className="spacer" />
        <ThemeToggle />
      </header>
      <main id="main" className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}

/* --------------------------------------------------------- contributor area */

function ContributorShell({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const me = state.session.contributor;
  const active = state.applications.filter(a => !a.applicant && ['Assigned', 'PR submitted'].includes(a.status)).length;
  if (!me) return <Navigate to="/login?next=/me" replace />;
  return (
    <WorkspaceShell
      title="Contributor"
      sub={me}
      groups={[{
        heading: 'Your work',
        items: [
          { to: '/me', label: 'Assignments', icon: GitPullRequest, end: true, count: active },
          { to: '/me/points', label: 'Points', icon: Trophy },
          { to: '/me/settings', label: 'Settings', icon: Settings },
        ],
      }]}
      footer={<Link className="btn ghost sm block" to="/explore"><Compass size={14} />Back to explore</Link>}
    >
      {children}
    </WorkspaceShell>
  );
}

