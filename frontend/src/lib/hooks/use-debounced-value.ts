"use client";

import { useEffect, useState } from "react";

/**
 * Trails a value that changes faster than it is worth acting on.
 *
 * Dragging an assumption slider crosses twenty values on the way to the one the user meant; each
 * of those would otherwise be a request that recomputes the whole portfolio.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
