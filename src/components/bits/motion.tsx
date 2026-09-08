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

/* ---------------------------------------------------------------- SplitText */
/** Reveals per word, staggered, once the element scrolls into view. */
export function SplitText({
  text, className = '', delay = 0, as: Tag = 'span',
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: 'span' | 'h1' | 'h2' | 'p';
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduced = useReducedMotion();
  const show = inView || reduced;
  const words = useMemo(() => text.split(' '), [text]);
  const MotionTag = motion[Tag] as typeof motion.span;

  return (
    <MotionTag ref={ref as never} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="bit-split-word" aria-hidden="true">
          <motion.span
            className="bit-split-inner"
            initial={reduced ? false : { y: '110%', opacity: 0 }}
            animate={show ? { y: '0%', opacity: 1 } : undefined}
            transition={{ duration: 0.55, ease: EASE, delay: delay + i * 0.045 }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </MotionTag>
  );
}

/* ----------------------------------------------------------------- CountUp */
/** Counts to a target when scrolled into view. */
export function CountUp({
  to, prefix = '', suffix = '', duration = 1.4, className = '',
}: {
  to: number; prefix?: string; suffix?: string; duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) { setValue(to); return; }
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      // ease-out cubic
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduced]);

  return (
    <span ref={ref} className={`num ${className}`}>
      {prefix}{value.toLocaleString('en-US')}{suffix}
    </span>
  );
}

/* ----------------------------------------------------------- SpotlightCard */
/** Radial highlight that tracks the cursor across the card. */
export function SpotlightCard({
  children, className = '', as = 'div',
}: {
  children: ReactNode; className?: string; as?: 'div' | 'article';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--sx', `${e.clientX - r.left}px`);
    el.style.setProperty('--sy', `${e.clientY - r.top}px`);
  }, []);
  const Tag = as as 'div';
  return (
    <Tag ref={ref} className={`bit-spotlight ${className}`} onPointerMove={onMove}>
      <span className="bit-spotlight-glow" aria-hidden="true" />
      <span className="bit-spotlight-body">{children}</span>
    </Tag>
  );
}

/* -------------------------------------------------------------- StarBorder */
/** Conic gradient that travels around the border. */
export function StarBorder({
  children, className = '', ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`bit-starborder ${className}`} {...rest}>
      <span className="bit-starborder-ring" aria-hidden="true" />
      <span className="bit-starborder-inner">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ Magnet */
/** Element drifts toward the pointer while it is nearby. */
export function Magnet({
  children, strength = 0.35, radius = 90, className = '',
}: {
  children: ReactNode; strength?: number; radius?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 22 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      if (Math.hypot(dx, dy) < r.width / 2 + radius) {
        x.set(dx * strength);
        y.set(dy * strength);
      } else {
        x.set(0);
        y.set(0);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [x, y, strength, radius]);

  return (
    <motion.span ref={ref} className={`bit-magnet ${className}`} style={{ x, y }}>
      {children}
    </motion.span>
  );
}

