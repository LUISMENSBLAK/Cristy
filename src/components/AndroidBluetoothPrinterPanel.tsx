'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  imprimirTicketDiagnosticoAndroidBluetooth,
  isAndroidBluetoothPrinterApp,
  listarImpresorasAndroidBluetooth,
  obtenerImpresoraAndroidBluetoothSeleccionada,
  seleccionarImpresoraAndroidBluetooth,
  solicitarPermisoImpresoraAndroidBluetooth,
  tienePermisoImpresoraAndroidBluetooth,
} from '@/utils/printTicket'

type Status = { type: 'info' | 'success' | 'error'; message: string } | null

export function AndroidBluetoothPrinterPanel() {
  const [detected, setDetected] = useState<BluetoothPrinterDevice[]>([])
  const [selectedAddress, setSelectedAddress] = useState('')
  const [hasPermission, setHasPermission] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [testing, setTesting] = useState(false)
  const androidDetected = isAndroidBluetoothPrinterApp()

  const selectedDevice = useMemo(
    () => detected.find(device => device.address === selectedAddress) ?? null,
    [detected, selectedAddress],
  )

  const refresh = useCallback(() => {
    if (!isAndroidBluetoothPrinterApp()) return
    const printers = listarImpresorasAndroidBluetooth()
    const selected = obtenerImpresoraAndroidBluetoothSeleccionada()
    setDetected(printers)
    setSelectedAddress(selected?.address ?? '')
    setHasPermission(tienePermisoImpresoraAndroidBluetooth())
    if (printers.length === 0) {
      setStatus({
        type: 'error',
        message:
          'No se detectó ninguna impresora Bluetooth emparejada. Empareja la impresora primero desde Ajustes de Android (Bluetooth), luego vuelve aquí y actualiza.',
      })
    } else {
      setStatus({
        type: 'info',
        message: `Se encontraron ${printers.length} dispositivo(s) Bluetooth emparejado(s).`,
      })
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
    window.addEventListener('android-bluetooth-printer-devices-changed', handleDeviceChange)
    window.addEventListener('android-bluetooth-printer-permission', handlePermission)
    return () => {
      window.removeEventListener('android-bluetooth-printer-devices-changed', handleDeviceChange)
      window.removeEventListener('android-bluetooth-printer-permission', handlePermission)
    }
  }, [androidDetected, refresh])

  const handleSelection = (address: string) => {
    setSelectedAddress(address)
    const device = detected.find(candidate => candidate.address === address)
    if (!device) return
    const saved = seleccionarImpresoraAndroidBluetooth(device)
    setHasPermission(saved && tienePermisoImpresoraAndroidBluetooth())
    setStatus(
      saved
        ? { type: 'success', message: `Impresora seleccionada: ${device.name}.` }
        : { type: 'error', message: 'La APK no pudo guardar la selección.' },
    )
  }

  const handlePermission = () => {
    const requested = solicitarPermisoImpresoraAndroidBluetooth()
    if (!requested) {
      setStatus({ type: 'error', message: 'No se pudo verificar el permiso Bluetooth.' })
      return
    }
    const granted = tienePermisoImpresoraAndroidBluetooth()
    setHasPermission(granted)
    setStatus({
      type: granted ? 'success' : 'error',
      message: granted
        ? 'Permiso Bluetooth disponible. Ya puedes imprimir.'
        : "Falta el permiso BLUETOOTH_CONNECT. Otórgalo en Configuración → Aplicaciones → Cristi's POS → Permisos.",
    })
  }

  const handleTest = async () => {
    setTesting(true)
    setStatus({ type: 'info', message: 'Enviando ticket de diagnóstico por Bluetooth…' })
    const result = await imprimirTicketDiagnosticoAndroidBluetooth()
    setTesting(false)
    setStatus({
      type: result.success ? 'success' : 'error',
      message:
        result.message ||
        (result.success ? 'Ticket de diagnóstico enviado.' : 'No se pudo imprimir la prueba.'),
    })
    setHasPermission(tienePermisoImpresoraAndroidBluetooth())
  }

  if (!androidDetected) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-bold">APK Android no detectada</p>
        <p className="mt-1 text-xs">
          Esta configuración funciona únicamente al abrir el punto de venta desde la aplicación
          "Cristi's POS", no desde Chrome u otro navegador.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-bold text-blue-900">APK Android detectada — Bluetooth</p>
          <p className="text-xs text-blue-800">
            El puente Bluetooth (SPP) está disponible. Asegúrate de que la impresora esté
            emparejada desde Ajustes → Bluetooth.
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
            hasPermission ? 'bg-blue-700 text-white' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {hasPermission ? 'BT AUTORIZADO' : 'FALTA PERMISO'}
        </span>
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={refresh}>
        🔄 Actualizar dispositivos emparejados
      </Button>

      {detected.length > 0 && (
        <div>
          <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">
            Impresora Bluetooth
          </label>
          <select
            value={selectedAddress}
            onChange={event => handleSelection(event.target.value)}
            className="w-full min-h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white text-sm"
          >
            <option value="">Selecciona la impresora…</option>
            {detected.map(device => (
              <option key={device.address} value={device.address}>
                {device.name} — {device.address}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={handlePermission}>
          Verificar permiso BT
        </Button>
        <Button
          type="button"
          disabled={!selectedDevice || !hasPermission || testing}
          onClick={handleTest}
        >
          {testing ? 'Imprimiendo…' : 'Imprimir prueba'}
        </Button>
      </div>

      {selectedDevice && (
        <p className="text-[10px] text-blue-900 break-all">
          Seleccionada: {selectedDevice.name} — {selectedDevice.address}
        </p>
      )}

      {status && (
        <div
          className={`rounded-md px-3 py-2 text-xs font-semibold ${
            status.type === 'success'
              ? 'bg-green-100 text-green-800'
              : status.type === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-blue-100 text-blue-800'
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  )
}
