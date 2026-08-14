'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  imprimirTicketDiagnosticoAndroid,
  isAndroidPrinterApp,
  listarImpresorasAndroid,
  obtenerImpresoraAndroidSeleccionada,
  seleccionarImpresoraAndroid,
  solicitarPermisoImpresoraAndroid,
  tienePermisoImpresoraAndroid,
} from '@/utils/printTicket'

type Status = { type: 'info' | 'success' | 'error'; message: string } | null

function deviceKey(device: AndroidPrinterDevice): string {
  return `${device.vendorId}:${device.productId}:${device.deviceName}`
}

function deviceTechnicalLabel(device: AndroidPrinterDevice): string {
  return `VID ${device.vendorId} · PID ${device.productId}`
}

export function AndroidPrinterPanel() {
  const [detected, setDetected] = useState<AndroidPrinterDevice[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [hasPermission, setHasPermission] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [testing, setTesting] = useState(false)
  const androidDetected = isAndroidPrinterApp()

  const selectedDevice = useMemo(
    () => detected.find(device => deviceKey(device) === selectedKey) ?? null,
    [detected, selectedKey],
  )

  const refresh = useCallback(() => {
    if (!isAndroidPrinterApp()) return
    const printers = listarImpresorasAndroid()
    const selected = obtenerImpresoraAndroidSeleccionada()
    setDetected(printers)
    setSelectedKey(selected ? deviceKey(selected) : '')
    setHasPermission(tienePermisoImpresoraAndroid())
    if (printers.length === 0) {
      setStatus({ type: 'error', message: 'No se detectó ningún dispositivo USB con salida de impresión. Conecta la GHIA mediante USB-C OTG.' })
    } else {
      setStatus({ type: 'info', message: `Se detectaron ${printers.length} dispositivo(s) USB compatible(s).` })
    }
  }, [])

  useEffect(() => {
    if (!androidDetected) return
    refresh()
    const handleDeviceChange = () => refresh()
    const handlePermission = (event: CustomEvent<{ granted: boolean; message: string }>) => {
      refresh()
      setStatus({ type: event.detail.granted ? 'success' : 'error', message: event.detail.message })
    }
    window.addEventListener('android-printer-devices-changed', handleDeviceChange)
    window.addEventListener('android-printer-permission', handlePermission)
    return () => {
      window.removeEventListener('android-printer-devices-changed', handleDeviceChange)
      window.removeEventListener('android-printer-permission', handlePermission)
    }
  }, [androidDetected, refresh])

  const handleSelection = (key: string) => {
    setSelectedKey(key)
    const device = detected.find(candidate => deviceKey(candidate) === key)
    if (!device) return
    const saved = seleccionarImpresoraAndroid(device)
    setHasPermission(saved && device.hasPermission)
    setStatus(saved
      ? { type: 'success', message: `Impresora seleccionada: ${device.displayName}.` }
      : { type: 'error', message: 'La APK no pudo guardar la selección.' })
  }

  const handlePermission = () => {
    if (!selectedDevice) {
      setStatus({ type: 'error', message: 'Primero selecciona la impresora GHIA.' })
      return
    }
    const requested = solicitarPermisoImpresoraAndroid(selectedDevice)
    if (!requested) {
      setStatus({ type: 'error', message: 'No se pudo abrir la solicitud de permiso USB.' })
      return
    }
    setStatus({ type: 'info', message: 'Acepta el permiso USB que mostrará Android. Marca la opción para usar siempre este dispositivo cuando aparezca.' })
  }

  const handleTest = async () => {
    setTesting(true)
    setStatus({ type: 'info', message: 'Enviando ticket de diagnóstico…' })
    const result = await imprimirTicketDiagnosticoAndroid()
    setTesting(false)
    setStatus({
      type: result.success ? 'success' : 'error',
      message: result.message || (result.success ? 'Ticket de diagnóstico enviado.' : 'No se pudo imprimir la prueba.'),
    })
    setHasPermission(tienePermisoImpresoraAndroid())
  }

  if (!androidDetected) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">APK Android no detectada</p>
        <p className="mt-1 text-xs">
          Esta configuración funciona únicamente al abrir el punto de venta desde la aplicación “Cristi's POS”, no desde Chrome.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-bold text-green-900">Aplicación Android detectada</p>
          <p className="text-xs text-green-800">El puente nativo USB está disponible.</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${hasPermission ? 'bg-green-700 text-white' : 'bg-amber-100 text-amber-800'}`}>
          {hasPermission ? 'USB AUTORIZADO' : 'FALTA PERMISO'}
        </span>
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={refresh}>
        🔍 Buscar impresoras USB
      </Button>

      {detected.length > 0 && (
        <div>
          <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Dispositivo USB</label>
          <select
            value={selectedKey}
            onChange={event => handleSelection(event.target.value)}
            className="w-full min-h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white text-sm"
          >
            <option value="">Selecciona la GHIA 58B1…</option>
            {detected.map(device => (
              <option key={deviceKey(device)} value={deviceKey(device)}>
                {device.displayName} · {deviceTechnicalLabel(device)} {device.hasPermission ? '· Autorizada' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={!selectedDevice} onClick={handlePermission}>
          Autorizar USB
        </Button>
        <Button type="button" disabled={!selectedDevice || !hasPermission || testing} onClick={handleTest}>
          {testing ? 'Imprimiendo…' : 'Imprimir prueba'}
        </Button>
      </div>

      {selectedDevice && (
        <p className="text-[10px] text-green-900 break-all">
          Seleccionada: {selectedDevice.displayName} · {deviceTechnicalLabel(selectedDevice)} · {selectedDevice.deviceName}
        </p>
      )}

      {status && (
        <div className={`rounded-md px-3 py-2 text-xs font-semibold ${
          status.type === 'success' ? 'bg-green-100 text-green-800' :
          status.type === 'error' ? 'bg-red-100 text-red-700' :
          'bg-blue-100 text-blue-800'
        }`}>
          {status.message}
        </div>
      )}
    </div>
  )
}
