import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { readState, storageKey, type State } from './model';

interface Store {
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  notify: (message: string) => void;
}

const Ctx = createContext<Store>(null!);
export const useApp = () => useContext(Ctx);

export function Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readState);
  const [toast, setToast] = useState('');

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { /* Private mode keeps the preview in memory for this session. */ }
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message: string) => setToast(message), []);
  const value = useMemo(() => ({ state, setState, notify }), [state, notify]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 12, x: '-50%', scale: 0.96 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 8, x: '-50%', scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
