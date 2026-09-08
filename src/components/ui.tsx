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

