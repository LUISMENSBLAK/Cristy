let audioCtx: AudioContext | null = null

export function unlockAudio() {
  // Safari en iPhone bloquea audio hasta el primer gesto del usuario.
  // Llamar esto una sola vez en el primer click/tap de la sesión.
  if (typeof window === 'undefined') return
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

function beep(freq: number, duration: number, delay: number = 0, volume: number = 0.3) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(volume, audioCtx.currentTime + delay)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration)
  osc.start(audioCtx.currentTime + delay)
  osc.stop(audioCtx.currentTime + delay + duration)
}

// Sonido para: nuevo pedido llega a cocina (dos tonos ascendentes, urgente)
export function playNuevoPedido() {
  beep(660, 0.15, 0)
  beep(880, 0.2, 0.15)
}

// Sonido para: un item individual quedó listo (un solo tono corto, sutil)
export function playItemListo() {
  console.log('[Audio Debug] playItemListo called. Context state:', audioCtx?.state)
  beep(523, 0.15, 0)
  beep(659, 0.15, 0.15)
  beep(784, 0.25, 0.3)
}

// Sonido para: pedido completo listo para recoger (tres tonos, más notorio)
export function playPedidoListo() {
  console.log('[Audio Debug] playPedidoListo called. Context state:', audioCtx?.state)
  beep(523, 0.15, 0)
  beep(659, 0.15, 0.15)
  beep(784, 0.25, 0.3)
}
