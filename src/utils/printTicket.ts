import { formatOrderType } from '@/lib/utils'
import {
  ESC_POS_DOTS_58MM,
  buildDiagnosticEscPosBytes,
  buildCashDrawerKickCommand,
  buildEscPosBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  type EscPosOrderData,
  type EscPosTicketSettings,
} from '@/utils/escPos'

export type PrintOrderData = EscPosOrderData & { isKitchen?: boolean }

export type PrintChannel = 'android_usb' | 'android_bluetooth' | 'usb_qz' | 'red' | 'browser' | 'disabled'

export interface PrintResult {
  success: boolean
  channel: PrintChannel
  message?: string
  errorCode?: string
}

export interface PrinterSettings extends EscPosTicketSettings {
  impresora_activa?: boolean | null
  impresora_modo?: 'red' | 'bluetooth' | 'usb_qz' | 'android_usb' | 'android_bluetooth' | string | null
  impresora_papel_mm?: string | null
  impresora_ip?: string | null
  nombre_impresora_windows?: string | null
  ticket_logo_url?: string | null
}

const ANDROID_PRINT_TIMEOUT_MS = 25_000
const ANDROID_LOGO_WIDTH_DOTS = 320

/** Lazy-load qz-tray only in the browser (it requires window/document). */
async function loadQZ(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('QZ Tray requiere un navegador')
  const qz = (await import('qz-tray')).default
  return qz
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function absoluteAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return new URL(path, window.location.origin).toString()
}

/** Convert any image URL to a pure black-and-white data URL for QZ Tray. */
async function convertToBlackAndWhite(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('No se pudo crear el canvas del logo'))
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(img, 0, 0)
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = imageData.data
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255
        const red = pixels[index] * alpha + 255 * (1 - alpha)
        const green = pixels[index + 1] * alpha + 255 * (1 - alpha)
        const blue = pixels[index + 2] * alpha + 255 * (1 - alpha)
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
        const monochrome = luminance < 160 ? 0 : 255
        pixels[index] = monochrome
        pixels[index + 1] = monochrome
        pixels[index + 2] = monochrome
        pixels[index + 3] = 255
      }
      context.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error(`No se pudo cargar el logo: ${url}`))
    img.src = url
  })
}

/** Convert a browser image into a GS v 0 ESC/POS raster command. */
async function imageToEscPosRaster(url: string, maxWidthDots = ANDROID_LOGO_WIDTH_DOTS): Promise<Uint8Array> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image()
    candidate.crossOrigin = 'anonymous'
    candidate.onload = () => resolve(candidate)
    candidate.onerror = () => reject(new Error(`No se pudo cargar el logo: ${url}`))
    candidate.src = url
  })

  const sourceWidth = Math.max(1, image.naturalWidth)
  const sourceHeight = Math.max(1, image.naturalHeight)
  const scaledWidth = Math.max(8, Math.min(maxWidthDots, sourceWidth))
  const scaledHeight = Math.max(1, Math.round(sourceHeight * (scaledWidth / sourceWidth)))
  const bytesPerRow = Math.ceil(scaledWidth / 8)
  const canvasWidth = bytesPerRow * 8

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = scaledHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('No se pudo procesar el logo para ESC/POS')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvasWidth, scaledHeight)
  const left = Math.floor((canvasWidth - scaledWidth) / 2)
  context.drawImage(image, left, 0, scaledWidth, scaledHeight)
  const rgba = context.getImageData(0, 0, canvasWidth, scaledHeight).data
  const bitmap = new Uint8Array(bytesPerRow * scaledHeight)

  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < canvasWidth; x += 1) {
      const pixel = (y * canvasWidth + x) * 4
      const alpha = rgba[pixel + 3] / 255
      const red = rgba[pixel] * alpha + 255 * (1 - alpha)
      const green = rgba[pixel + 1] * alpha + 255 * (1 - alpha)
      const blue = rgba[pixel + 2] * alpha + 255 * (1 - alpha)
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
      if (luminance < 160) {
        bitmap[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8)
      }
    }
  }

  const xLow = bytesPerRow & 0xff
  const xHigh = (bytesPerRow >> 8) & 0xff
  const yLow = scaledHeight & 0xff
  const yHigh = (scaledHeight >> 8) & 0xff
  return concatBytes(
    Uint8Array.of(0x1d, 0x76, 0x30, 0x00, xLow, xHigh, yLow, yHigh),
    bitmap,
  )
}

export function isAndroidPrinterApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AndroidPrinter?.isAvailable())
}

export function isAndroidBluetoothPrinterApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AndroidBluetoothPrinter?.isAvailable())
}

function parseAndroidDevice(raw: string): AndroidPrinterDevice | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as AndroidPrinterDevice
  } catch {
    return null
  }
}

export function listarImpresorasAndroid(): AndroidPrinterDevice[] {
  if (!isAndroidPrinterApp() || !window.AndroidPrinter) return []
  try {
    const parsed = JSON.parse(window.AndroidPrinter.listPrinters()) as unknown
    return Array.isArray(parsed) ? parsed as AndroidPrinterDevice[] : []
  } catch (error) {
    console.warn('[Print Android] Respuesta inválida al listar impresoras:', error)
    return []
  }
}

export function obtenerImpresoraAndroidSeleccionada(): AndroidPrinterDevice | null {
  if (!isAndroidPrinterApp() || !window.AndroidPrinter) return null
  return parseAndroidDevice(window.AndroidPrinter.getSelectedPrinter())
}

export function seleccionarImpresoraAndroid(device: AndroidPrinterDevice): boolean {
  if (!isAndroidPrinterApp() || !window.AndroidPrinter) return false
  return window.AndroidPrinter.selectPrinter(device.vendorId, device.productId, device.deviceName)
}

export function solicitarPermisoImpresoraAndroid(device: AndroidPrinterDevice): boolean {
  if (!isAndroidPrinterApp() || !window.AndroidPrinter) return false
  return window.AndroidPrinter.requestPermission(device.vendorId, device.productId, device.deviceName)
}

export function tienePermisoImpresoraAndroid(): boolean {
  return Boolean(isAndroidPrinterApp() && window.AndroidPrinter?.hasPermission())
}

async function sendAndroidPrintJob(bytes: Uint8Array, timeoutMs = ANDROID_PRINT_TIMEOUT_MS): Promise<PrintResult> {
  if (!isAndroidPrinterApp() || !window.AndroidPrinter) {
    return {
      success: false,
      channel: 'android_usb',
      errorCode: 'ANDROID_BRIDGE_UNAVAILABLE',
      message: "Esta opción requiere abrir Cristi's POS desde la APK Android.",
    }
  }

  const jobId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise(resolve => {
    let settled = false
    const finish = (result: PrintResult) => {
      if (settled) return
      settled = true
      window.removeEventListener('android-printer-result', handleResult)
      clearTimeout(timeoutId)
      resolve(result)
    }

    const handleResult = (event: CustomEvent<AndroidPrinterResultDetail>) => {
      if (event.detail?.jobId !== jobId) return
      finish({
        success: Boolean(event.detail.success),
        channel: 'android_usb',
        message: event.detail.message,
        errorCode: event.detail.errorCode,
      })
    }

    const timeoutId = window.setTimeout(() => {
      finish({
        success: false,
        channel: 'android_usb',
        errorCode: 'ANDROID_PRINT_TIMEOUT',
        message: 'La impresora no confirmó el trabajo dentro del tiempo esperado.',
      })
    }, timeoutMs)

    window.addEventListener('android-printer-result', handleResult)

    try {
      const accepted = window.AndroidPrinter!.printBase64(bytesToBase64(bytes), jobId)
      if (!accepted) {
        finish({
          success: false,
          channel: 'android_usb',
          errorCode: 'ANDROID_JOB_REJECTED',
          message: window.AndroidPrinter!.getLastError() || 'La APK rechazó el trabajo de impresión.',
        })
      }
    } catch (error) {
      finish({
        success: false,
        channel: 'android_usb',
        errorCode: 'ANDROID_BRIDGE_ERROR',
        message: getErrorMessage(error),
      })
    }
  })
}

async function buildAndroidTicket(orderData: PrintOrderData, settings: PrinterSettings): Promise<Uint8Array> {
  let logoRaster: Uint8Array | null = null
  if (settings.ticket_mostrar_logo ?? true) {
    const logoUrl = settings.ticket_logo_url || '/LogoCristisCofre.png'
    try {
      logoRaster = await imageToEscPosRaster(absoluteAssetUrl(logoUrl), Math.min(ANDROID_LOGO_WIDTH_DOTS, ESC_POS_DOTS_58MM))
    } catch (error) {
      console.warn('[Print Android] No se pudo rasterizar el logo; se imprimirá el ticket sin imagen:', error)
    }
  }
  const is58 = settings.impresora_papel_mm === '58'
  let ticketBytes = buildEscPosBytes(orderData, settings, { logoRaster, lineWidth: is58 ? 32 : 48 })
  if (settings.caja_apertura_automatica && orderData.tipoTicket !== 'cuenta') {
    ticketBytes = concatBytes(buildCashDrawerKickCommand(), ticketBytes)
  }
  return ticketBytes
}

export async function imprimirTicketDiagnosticoAndroid(): Promise<PrintResult> {
  const selected = obtenerImpresoraAndroidSeleccionada()
  const label = selected
    ? `${selected.displayName} VID:${selected.vendorId} PID:${selected.productId}`
    : 'Sin impresora seleccionada'
  return sendAndroidPrintJob(buildDiagnosticEscPosBytes(label))
}

// ─── Android Bluetooth helpers ────────────────────────────────────────────────

function parseBluetoothDevice(raw: string): BluetoothPrinterDevice | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as BluetoothPrinterDevice
  } catch {
    return null
  }
}

export function listarImpresorasAndroidBluetooth(): BluetoothPrinterDevice[] {
  if (!isAndroidBluetoothPrinterApp() || !window.AndroidBluetoothPrinter) return []
  try {
    const parsed = JSON.parse(window.AndroidBluetoothPrinter.listPrinters()) as unknown
    return Array.isArray(parsed) ? parsed as BluetoothPrinterDevice[] : []
  } catch (error) {
    console.warn('[Print BT] Respuesta inválida al listar impresoras:', error)
    return []
  }
}

export function obtenerImpresoraAndroidBluetoothSeleccionada(): BluetoothPrinterDevice | null {
  if (!isAndroidBluetoothPrinterApp() || !window.AndroidBluetoothPrinter) return null
  return parseBluetoothDevice(window.AndroidBluetoothPrinter.getSelectedPrinter())
}

export function seleccionarImpresoraAndroidBluetooth(device: BluetoothPrinterDevice): boolean {
  if (!isAndroidBluetoothPrinterApp() || !window.AndroidBluetoothPrinter) return false
  return window.AndroidBluetoothPrinter.selectPrinter(device.address)
}

export function solicitarPermisoImpresoraAndroidBluetooth(): boolean {
  if (!isAndroidBluetoothPrinterApp() || !window.AndroidBluetoothPrinter) return false
  return window.AndroidBluetoothPrinter.requestPermission()
}

export function tienePermisoImpresoraAndroidBluetooth(): boolean {
  return Boolean(isAndroidBluetoothPrinterApp() && window.AndroidBluetoothPrinter?.hasPermission())
}

async function sendAndroidBluetoothPrintJob(bytes: Uint8Array, timeoutMs = ANDROID_PRINT_TIMEOUT_MS): Promise<PrintResult> {
  if (!isAndroidBluetoothPrinterApp() || !window.AndroidBluetoothPrinter) {
    return {
      success: false,
      channel: 'android_bluetooth',
      errorCode: 'ANDROID_BT_BRIDGE_UNAVAILABLE',
      message: "Esta opción requiere abrir Cristi's POS desde la APK Android.",
    }
  }

  const jobId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise(resolve => {
    let settled = false
    const finish = (result: PrintResult) => {
      if (settled) return
      settled = true
      window.removeEventListener('android-bluetooth-printer-result', handleResult)
      clearTimeout(timeoutId)
      resolve(result)
    }

    const handleResult = (event: CustomEvent<AndroidPrinterResultDetail>) => {
      if (event.detail?.jobId !== jobId) return
      finish({
        success: Boolean(event.detail.success),
        channel: 'android_bluetooth',
        message: event.detail.message,
        errorCode: event.detail.errorCode,
      })
    }

    const timeoutId = window.setTimeout(() => {
      finish({
        success: false,
        channel: 'android_bluetooth',
        errorCode: 'ANDROID_BT_PRINT_TIMEOUT',
        message: 'La impresora Bluetooth no confirmó el trabajo dentro del tiempo esperado.',
      })
    }, timeoutMs)

    window.addEventListener('android-bluetooth-printer-result', handleResult)

    try {
      const accepted = window.AndroidBluetoothPrinter!.printBase64(bytesToBase64(bytes), jobId)
      if (!accepted) {
        finish({
          success: false,
          channel: 'android_bluetooth',
          errorCode: 'ANDROID_BT_JOB_REJECTED',
          message: window.AndroidBluetoothPrinter!.getLastError() || 'La APK rechazó el trabajo de impresión Bluetooth.',
        })
      }
    } catch (error) {
      finish({
        success: false,
        channel: 'android_bluetooth',
        errorCode: 'ANDROID_BT_BRIDGE_ERROR',
        message: getErrorMessage(error),
      })
    }
  })
}

export async function imprimirTicketDiagnosticoAndroidBluetooth(): Promise<PrintResult> {
  const selected = obtenerImpresoraAndroidBluetoothSeleccionada()
  const label = selected
    ? `${selected.name} — ${selected.address}`
    : 'Sin impresora Bluetooth seleccionada'
  return sendAndroidBluetoothPrintJob(buildDiagnosticEscPosBytes(label))
}

/** Detect available printers via QZ Tray. */
export async function detectarImpresoras(): Promise<string[]> {
  try {
    const qz = await loadQZ()
    if (!qz.websocket.isActive()) await qz.websocket.connect()
    const result = await qz.printers.find()
    return Array.isArray(result) ? result : [result]
  } catch (error) {
    console.warn('[QZ Tray] detectarImpresoras falló:', getErrorMessage(error))
    throw error
  }
}

async function printWithQZ(orderData: PrintOrderData, settings: PrinterSettings): Promise<PrintResult> {
  const printerName = settings.nombre_impresora_windows?.trim()
  if (!printerName) {
    return { success: false, channel: 'usb_qz', errorCode: 'QZ_PRINTER_NOT_CONFIGURED', message: 'No hay una impresora de Windows seleccionada.' }
  }

  try {
    console.log('[Print QZ] Conectando a QZ Tray…')
    const qz = await loadQZ()
    if (!qz.websocket.isActive()) await qz.websocket.connect()
    const config = qz.configs.create(printerName)

    if (settings.ticket_mostrar_logo ?? true) {
      const logoUrl = absoluteAssetUrl(settings.ticket_logo_url || '/LogoCristisCofre.png')
      try {
        const monochromeLogo = await convertToBlackAndWhite(logoUrl)
        await qz.print(config, [
          '\x1B\x61\x01',
          { type: 'raw', format: 'image', data: monochromeLogo, options: { language: 'ESCPOS', dotDensity: 'double' } },
        ])
      } catch (error) {
        console.warn('[Print QZ] El logo falló; se continúa sin él:', error)
      }
    }

    const is58 = settings.impresora_papel_mm === '58'
    let ticket = buildEscPosBytes(orderData, settings, { lineWidth: is58 ? 32 : 48 })
    if (settings.caja_apertura_automatica && orderData.tipoTicket !== 'cuenta') {
      ticket = concatBytes(buildCashDrawerKickCommand(), ticket)
    }
    await qz.print(config, [{ type: 'raw', format: 'hex', data: bytesToHex(ticket) }])
    console.log('[Print QZ] Ticket enviado a', printerName)
    return { success: true, channel: 'usb_qz', message: `Ticket enviado a ${printerName}.` }
  } catch (error) {
    console.warn('[Print QZ] Error:', getErrorMessage(error))
    return { success: false, channel: 'usb_qz', errorCode: 'QZ_PRINT_FAILED', message: getErrorMessage(error) }
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character] ?? character)
}

async function printWithNetwork(orderData: PrintOrderData, settings: PrinterSettings): Promise<PrintResult> {
  const ip = settings.impresora_ip?.trim()
  if (!ip) return { success: false, channel: 'red', errorCode: 'NETWORK_IP_MISSING', message: 'Falta configurar la IP de la impresora.' }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 3_500)
  try {
    let xml = '<text lang="es" align="center" smooth="true" font="font_a"/>'
    xml += `<text>${escapeXml(settings.negocio_nombre ?? "CRISTI'S COFFE & SNACK")}\n\n${orderData.isKitchen ? '*** TICKET DE COCINA ***\n\n' : ''}Ticket: #${escapeXml(orderData.orderId.slice(0, 8).toUpperCase())}\nFecha: ${escapeXml(orderData.fecha)}\n</text>`
    xml += '<text>--------------------------------\n</text><text align="left">'
    for (const item of orderData.items) {
      xml += `<text>${item.cantidad}x ${escapeXml(item.nombre)}${orderData.isKitchen ? '' : ` $${(item.precio_unitario * item.cantidad).toFixed(2)}`}\n</text>`
      if (item.ingredientes_seleccionados?.length) xml += `<text>  Con: ${escapeXml(item.ingredientes_seleccionados.join(', '))}\n</text>`
      if (item.extra_nombre && item.extra_precio != null) xml += `<text>  + ${escapeXml(item.extra_nombre)}${orderData.isKitchen ? '' : ` $${(item.extra_precio * item.cantidad).toFixed(2)}`}\n</text>`
    }
    xml += '</text><text align="center">--------------------------------\n</text>'
    
    if (!orderData.isKitchen) {
      xml += `<text align="right">Total: $${orderData.total.toFixed(2)}\nPagado con: ${escapeXml(orderData.metodoPago.toUpperCase())}\n\n</text>`
      xml += '<text align="center">¡Gracias por su compra!\n\n\n</text>'
    } else {
      xml += `<text align="center">Mesa: ${escapeXml(orderData.mesa || 'Barra')} / ${escapeXml(orderData.atendidoPor || '')}\n\n\n</text>`
    }
    xml += '<cut type="feed"/>'

    const payload = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="urn:epos-print">${xml}</epos-print></s:Body></s:Envelope>`
    const response = await fetch(`http://${ip}/cgi-bin/epos/dispacher?devid=local_printer&timeout=5000`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: payload,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`La impresora respondió HTTP ${response.status}`)
    return { success: true, channel: 'red', message: `Ticket enviado a ${ip}.` }
  } catch (error) {
    console.warn('[Print Network] Error:', getErrorMessage(error))
    return { success: false, channel: 'red', errorCode: 'NETWORK_PRINT_FAILED', message: getErrorMessage(error) }
  } finally {
    clearTimeout(timeoutId)
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  })[character] ?? character)
}

function printWithBrowser(orderData: PrintOrderData, settings: PrinterSettings): PrintResult {
  const font = settings.ticket_tamano_fuente || 'normal'
  const fontSize = font === 'pequena' ? '10px' : font === 'grande' ? '14px' : '12px'
  const showAttendant = settings.ticket_mostrar_atendido_por ?? true
  const showLogo = settings.ticket_mostrar_logo ?? true
  const farewell = settings.ticket_mensaje_despedida ?? '¡Gracias por su compra!'
  const logoUrl = settings.ticket_logo_url || '/LogoCristisCofre.png'

  const widthMm = settings.impresora_papel_mm === '58' ? '58mm' : '80mm'
  
  const ticketHtml = `
    <div style="font-family: Arial, sans-serif; color:#111; font-size:${fontSize}; width:${widthMm}; padding:3mm; box-sizing:border-box;">
      <div style="text-align:center; margin-bottom:10px;">
        ${showLogo ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:46mm; max-height:28mm; object-fit:contain; display:block; margin:0 auto 5px;" />` : ''}
        <div style="font-size:13px; font-weight:bold;">${escapeHtml(settings.negocio_nombre ?? "Cristi's Coffe & Snack")}</div>
        ${settings.negocio_direccion ? `<div style="font-size:10px;">${escapeHtml(settings.negocio_direccion)}</div>` : ''}
        ${settings.negocio_telefono ? `<div style="font-size:10px;">Tel: ${escapeHtml(settings.negocio_telefono)}</div>` : ''}
        ${settings.negocio_rfc ? `<div style="font-size:10px;">RFC: ${escapeHtml(settings.negocio_rfc)}</div>` : ''}
        <div style="font-size:11px; margin-top:4px;">Ticket: #${escapeHtml(orderData.orderId.slice(0, 8).toUpperCase())}</div>
        <div style="font-size:11px;">Fecha: ${escapeHtml(orderData.fecha)}</div>
        ${orderData.tipoPedido ? `<div style="font-size:11px; font-weight:bold;">${escapeHtml(formatOrderType(orderData.tipoPedido))}</div>` : ''}
        ${showAttendant && orderData.atendidoPor ? `<div style="font-size:10px;">Atendido por: ${escapeHtml(orderData.atendidoPor)}</div>` : ''}
      </div>
      <div style="border-top:1px dashed #111; margin:7px 0;"></div>
      ${orderData.items.map(item => `
        <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:4px;"><div>${item.cantidad}x ${escapeHtml(item.nombre)}</div><div>${orderData.isKitchen ? '' : `$${(item.precio_unitario * item.cantidad).toFixed(2)}`}</div></div>
        ${item.variante_nombre ? `<div style="padding-left:12px; font-size:10px;">- ${escapeHtml(item.variante_nombre)}</div>` : ''}
        ${(item.extras_pago ?? []).map(extra => `<div style="display:flex; justify-content:space-between; padding-left:12px; font-size:10px;"><div>+ ${escapeHtml(extra.nombre)}</div><div>${orderData.isKitchen ? '' : `$${(extra.precio * item.cantidad).toFixed(2)}`}</div></div>`).join('')}
        ${item.extra_nombre && item.extra_precio != null ? `<div style="display:flex; justify-content:space-between; padding-left:12px; font-size:10px;"><div>+ ${escapeHtml(item.extra_nombre)}</div><div>${orderData.isKitchen ? '' : `$${(item.extra_precio * item.cantidad).toFixed(2)}`}</div></div>` : ''}
        ${item.ingredientes_seleccionados?.length ? `<div style="padding-left:12px; font-size:10px;">Con: ${escapeHtml(item.ingredientes_seleccionados.join(', '))}</div>` : ''}
        ${item.notas ? `<div style="padding-left:12px; font-size:10px; font-style:italic;">Nota: ${escapeHtml(item.notas)}</div>` : ''}
      `).join('')}
      <div style="border-top:1px dashed #111; margin:7px 0;"></div>
      ${!orderData.isKitchen ? `
        <div style="text-align:right; font-size:13px; font-weight:bold;">Total: $${orderData.total.toFixed(2)}</div>
        <div style="text-align:right; font-size:11px;">Pagado con: ${escapeHtml(orderData.metodoPago.toUpperCase())}</div>
        ${orderData.montoRecibido != null ? `<div style="text-align:right; font-size:11px;">Recibido: $${orderData.montoRecibido.toFixed(2)}</div>` : ''}
        ${orderData.cambio != null ? `<div style="text-align:right; font-size:11px;">Cambio: $${orderData.cambio.toFixed(2)}</div>` : ''}
        <div style="text-align:center; margin-top:16px; font-size:10px;">
          ${settings.ticket_linea_extra ? `<div>${escapeHtml(settings.ticket_linea_extra)}</div>` : ''}
          <div>${escapeHtml(farewell).replace(/\n/g, '<br>')}</div>
        </div>
      ` : `
        <div style="text-align:center; margin-top:16px; font-size:11px; font-weight:bold;">
          Mesa: ${escapeHtml(orderData.mesa || 'Barra')}
        </div>
      `}
    </div>`

  let printArea = document.getElementById('cristis-print-area')
  if (!printArea) {
    printArea = document.createElement('div')
    printArea.id = 'cristis-print-area'
    document.body.appendChild(printArea)
    const style = document.createElement('style')
    style.textContent = `
      @media print {
        body > *:not(#cristis-print-area) { display:none !important; }
        body { margin:0 !important; padding:0 !important; background:white !important; }
        #cristis-print-area { display:block !important; width:${widthMm}; margin:0; padding:0; }
        @page { margin:0; size:${widthMm} auto; }
      }
      @media screen { #cristis-print-area { display:none !important; } }
    `
    document.head.appendChild(style)
  }
  printArea.innerHTML = ticketHtml
  window.setTimeout(() => window.print(), 300)
  return { success: true, channel: 'browser', message: 'Se abrió el diálogo de impresión del navegador.' }
}

/** Main print router. It never rolls back a payment; failures are returned as structured results. */
export async function imprimirTicket(orderData: PrintOrderData, settings: PrinterSettings | null | undefined): Promise<PrintResult> {
  if (typeof window === 'undefined') {
    return { success: false, channel: 'browser', errorCode: 'BROWSER_REQUIRED', message: 'La impresión requiere un navegador.' }
  }

  console.log('[Print] Solicitud:', {
    activa: settings?.impresora_activa,
    modo: settings?.impresora_modo,
    android: isAndroidPrinterApp(),
  })

  if (!settings?.impresora_activa) {
    return { success: true, channel: 'disabled', message: 'La impresión automática está desactivada.' }
  }

  const mode = settings.impresora_modo || 'red'
  if (mode === 'android_usb') {
    const bytes = await buildAndroidTicket(orderData, settings)
    return sendAndroidPrintJob(bytes)
  }

  if (mode === 'android_bluetooth') {
    const bytes = await buildAndroidTicket(orderData, settings)
    return sendAndroidBluetoothPrintJob(bytes)
  }

  if (mode === 'usb_qz') {
    const result = await printWithQZ(orderData, settings)
    if (result.success || isAndroidPrinterApp()) return result
    console.warn('[Print QZ] Se utilizará el diálogo manual como respaldo.')
    return printWithBrowser(orderData, settings)
  }

  if (mode === 'red') {
    const result = await printWithNetwork(orderData, settings)
    if (result.success || isAndroidPrinterApp()) return result
    console.warn('[Print Network] Se utilizará el diálogo manual como respaldo.')
    return printWithBrowser(orderData, settings)
  }

  if (isAndroidPrinterApp()) {
    return {
      success: false,
      channel: 'android_usb',
      errorCode: 'ANDROID_MODE_NOT_SELECTED',
      message: "Selecciona “USB Android — APK Cristi's POS” en Configuración.",
    }
  }

  return printWithBrowser(orderData, settings)
}

export function buildKitchenTicket(orderData: PrintOrderData): PrintOrderData {
  return {
    ...orderData,
    isKitchen: true
  }
}

export async function imprimirTicketCocina(orderData: PrintOrderData, rawSettings: any): Promise<PrintResult> {
  if (!rawSettings?.impresora_cocina_activa) {
    return { success: true, channel: 'disabled', message: 'La impresora de cocina está desactivada.' }
  }

  const kitchenSettings: PrinterSettings = {
    ...rawSettings,
    impresora_activa: rawSettings.impresora_cocina_activa,
    impresora_modo: rawSettings.impresora_cocina_modo,
    impresora_ip: rawSettings.impresora_cocina_ip,
    nombre_impresora_windows: rawSettings.impresora_cocina_qz_nombre,
    ticket_mostrar_logo: false, // Omitimos logo en cocina por simplicidad visual
    ticket_mostrar_atendido_por: true,
  }

  const kitchenOrder = buildKitchenTicket(orderData)
  return imprimirTicket(kitchenOrder, kitchenSettings)
}
