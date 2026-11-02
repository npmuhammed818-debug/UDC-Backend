import { useRef } from 'react';

/** State disables the controls; this synchronous lock closes the same-tick gap. */
export function useActionLock() {
  const locked = useRef(false);
  return {
    acquire: () => { if (locked.current) return false; locked.current = true; return true; },
    release: () => { locked.current = false; },
  };
}
