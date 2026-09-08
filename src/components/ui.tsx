import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { LANG_COLOR, orgAvatar } from '../lib/program';

export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Page-level entrance. Every route body uses this so navigation feels continuous. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list container — children fade up in sequence. */
export function Stagger({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hide"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.035, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function Item({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hide: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export function Mark({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <path d="M5 15.5 12 4l7 11.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 20h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ to = '/', label = 'Surge' }: { to?: string; label?: string }) {
  return (
    <Link to={to} className="brand" aria-label={`${label} home`}>
      <span className="brand-mark"><Mark /></span>
      <span className="brand-name">{label}</span>
    </Link>
  );
}

/**
 * Real GitHub organization avatar. The letter tile always renders underneath and
 * the image fades in over it, so the slot is never blank while the fetch is in
 * flight and a 404 simply leaves the tile in place.
 */
export function Avatar({
  name, size = '', square = false, org,
}: {
  name: string;
  size?: string;
  square?: boolean;
  /** GitHub org to pull the real avatar for. Omit for people. */
  org?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').slice(0, 1).toUpperCase();
  const cls = `avatar ${square ? 'sq' : ''} ${size}`.trim();

  if (!org || failed) return <span className={cls}>{initial}</span>;

  return (
    <span className={`${cls} img`}>
      <span className="avatar-fallback" aria-hidden={loaded}>{initial}</span>
      <img
        src={orgAvatar(org, 96)}
        alt=""
        loading="lazy"
        decoding="async"
        data-loaded={loaded}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** Language dot in GitHub's colour for that language. */
export function LangDot({ lang }: { lang: string }) {
  return <span className="lang-dot" style={{ background: LANG_COLOR[lang] ?? 'var(--ink-4)' }} aria-hidden="true" />;
}

export function Chip({ children, tone = '', className = '' }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`chip ${tone} ${className}`.trim()}>{children}</span>;
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="row" style={{ gap: 5 }}>
          {i > 0 && <span className="sep">/</span>}
          {item.to ? <Link to={item.to}>{item.label}</Link> : <strong>{item.label}</strong>}
        </span>
      ))}
    </nav>
  );
}

