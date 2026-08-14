'use client'

import { useEffect, useState } from 'react'

/**
 * NetworkStatus
 * Renders a fixed banner at the top when the device is offline.
 * Mounts as a client component and listens to browser online/offline events.
 */
export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Initialise from current browser state
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-sm font-bold text-center py-2 px-4 flex items-center justify-center gap-2 shadow-lg animate-pulse"
    >
      <span>📡</span>
      <span>Sin conexión — Los cobros en efectivo se guardan localmente y se sincronizan al recuperar internet.</span>
      <span className="text-amber-100 font-normal text-xs ml-2">(Cobro con tarjeta requiere conexión en la terminal física)</span>
    </div>
  )
}
