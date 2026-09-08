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

