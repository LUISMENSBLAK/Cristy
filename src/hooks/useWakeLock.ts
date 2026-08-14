import { useEffect, useRef } from 'react'

/**
 * Requests a Screen Wake Lock to prevent the tablet from sleeping during
 * an active shift. Falls back silently on unsupported browsers (older iOS
 * Safari, some Android webviews, etc.).
 *
 * The OS automatically releases the lock when the tab is backgrounded, so
 * we re-request it on 'visibilitychange' when the page comes back to the
 * foreground.
 */
export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!('wakeLock' in navigator)) return

    const request = async () => {
      try {
        sentinelRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Battery too low, permission denied, or API unavailable — fail silently
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        request()
      }
    }

    request()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [])
}
