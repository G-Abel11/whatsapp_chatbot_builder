'use client';

import { useEffect } from 'react';

export function useKeyPress(
  keys: string[],
  callback: (e: KeyboardEvent) => void,
  options: { target?: React.RefObject<HTMLElement> } = {},
) {
  useEffect(() => {
    const el = options.target?.current ?? window;
    const handler = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        (keys.includes(event.key) || keys.includes(event.code))
      ) {
        callback(event);
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [keys, callback, options.target]);
}
