import { useCallback, useEffect, useRef } from 'react'

/**
 * Creates a debounced version of a callback function.
 * Ensures the callback is only invoked after the specified delay has passed
 * without it being called again. Useful for grouping rapid real-time updates.
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(callback)

  // Keep callback reference fresh
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args)
    }, delay)
  }, [delay])
}
