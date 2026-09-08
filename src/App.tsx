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

