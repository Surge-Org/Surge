import { useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Menu state that collapses whenever the route changes.
 *
 * The reset happens during render rather than in an effect, so the closed menu
 * is painted in the same commit as the new route instead of flashing open for
 * a frame. This is React's documented "adjust state when a value changes"
 * pattern: https://react.dev/reference/react/useState#storing-information-from-previous-renders
 */
export function useRouteMenu(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(pathname);

  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }

  return [open, setOpen];
}
