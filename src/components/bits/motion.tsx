/**
 * React Bits components, adapted.
 *
 * React Bits (reactbits.dev) ships as copy-paste source rather than an npm
 * dependency, so each component below is its pattern re-implemented against
 * this project's design tokens and the `motion` runtime already in use.
 */
import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode,
} from 'react';
import {
  AnimatePresence, motion, useInView, useMotionValue, useSpring, useTransform,
} from 'motion/react';

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** True when the OS asks for reduced motion. Reveals then render immediately. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ Aurora */
/** Slow-drifting colour field behind the hero. */
export function Aurora({ className = '' }: { className?: string }) {
  return (
    <div className={`bit-aurora ${className}`} aria-hidden="true">
      <span className="bit-aurora-a" />
      <span className="bit-aurora-b" />
      <span className="bit-aurora-c" />
    </div>
  );
}

/* ----------------------------------------------------------------- DotGrid */
/** Dot lattice that brightens around the cursor. */
export function DotGrid({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return <div ref={ref} className={`bit-dotgrid ${className}`} aria-hidden="true" />;
}

/* ------------------------------------------------------------ GradientText */
export function GradientText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`bit-gradient ${className}`}>{children}</span>;
}

/* --------------------------------------------------------------- ShinyText */
/** Light sweeps across the text on a loop. */
export function ShinyText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`bit-shiny ${className}`}>{children}</span>;
}

