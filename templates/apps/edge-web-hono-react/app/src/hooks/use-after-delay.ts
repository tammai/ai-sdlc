import { useEffect, useState } from "react";

/** True once `active` has stayed true for `ms` — loading skeletons only appear for waits that are noticeable. */
export function useAfterDelay(active: boolean, ms = 200) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, ms]);
  return active && elapsed;
}
