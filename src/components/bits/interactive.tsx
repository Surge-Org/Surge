import {
  useCallback, useEffect, useId, useRef, useState, type ReactNode,
} from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue } from 'motion/react';

const EASE = [0.2, 0.8, 0.2, 1] as const;

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==========================================================================
   GooeyNav
   A blob tracks the active item. An SVG goo filter merges the blob with the
   particles that burst on activation, so they read as one liquid mass.
   ========================================================================== */

interface GooItem { to: string; label: string; end?: boolean }

export function GooeyNav({ items }: { items: GooItem[] }) {
  const { pathname } = useLocation();
  const filterId = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<{ x: number; w: number } | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number }[]>([]);
  const seq = useRef(0);

  // Only commit when the measurement actually changes — setting a fresh object
  // every render would re-trigger this effect and loop forever.
  const sync = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const active = wrap.querySelector<HTMLElement>('a.on');
    if (!active) { setBlob(prev => (prev === null ? prev : null)); return; }
    const wr = wrap.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    const next = { x: Math.round(ar.left - wr.left), w: Math.round(ar.width) };
    setBlob(prev => (prev && prev.x === next.x && prev.w === next.w ? prev : next));
  }, []);

  useEffect(() => {
    sync();
    const ro = new ResizeObserver(sync);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', sync);
    return () => { ro.disconnect(); window.removeEventListener('resize', sync); };
  }, [sync, pathname]);

  const burst = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reduced()) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const ar = e.currentTarget.getBoundingClientRect();
    const id = seq.current++;
    setBursts(b => [...b, { id, x: ar.left - wr.left + ar.width / 2 }]);
    window.setTimeout(() => setBursts(b => b.filter(k => k.id !== id)), 700);
  };

  return (
    <div className="goo" ref={wrapRef}>
      <svg className="goo-defs" aria-hidden="true">
        <defs>
          <filter id={`goo-${filterId}`}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div className="goo-layer" style={{ filter: `url(#goo-${filterId})` }} aria-hidden="true">
        {blob && (
          <motion.span
            className="goo-blob"
            animate={{ x: blob.x, width: blob.w }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          />
        )}
        <AnimatePresence>
          {bursts.map(b => (
            <span key={b.id} className="goo-burst" style={{ left: b.x }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <motion.i
                  key={i}
                  initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                  animate={{
                    x: Math.cos((i / 6) * Math.PI * 2) * 34,
                    y: Math.sin((i / 6) * Math.PI * 2) * 22,
                    scale: 0,
                    opacity: 0,
                  }}
                  transition={{ duration: 0.62, ease: 'easeOut' }}
                />
              ))}
            </span>
          ))}
        </AnimatePresence>
      </div>

      <nav className="goo-items">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            onClick={burst}
            className={({ isActive }) => (isActive ? 'on' : '')}
          >
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

