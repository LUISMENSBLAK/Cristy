export interface EscPosOrderData {
  orderId: string
  tipoTicket?: string
  items: {
    nombre: string
    cantidad: number
    precio_unitario: number
    variante_nombre?: string
    extras_pago?: { nombre: string; precio: number }[]
    extra_nombre?: string
    extra_precio?: number
    ingredientes_seleccionados?: string[]
    cargo_ingredientes_extra?: number
    notas?: string
  }[]
  total: number
  metodoPago: string
  fecha: string
  tipoPedido?: string
  atendidoPor?: string
  montoRecibido?: number
  cambio?: number
  mesa?: string | null
}

export interface EscPosTicketSettings {
  caja_apertura_automatica?: boolean
  ticket_tamano_fuente?: 'pequena' | 'normal' | 'grande' | string
  ticket_mensaje_despedida?: string | null
  ticket_mostrar_atendido_por?: boolean | null
  ticket_mostrar_logo?: boolean | null
  negocio_nombre?: string | null
  negocio_direccion?: string | null
  negocio_telefono?: string | null
  negocio_rfc?: string | null
  ticket_linea_extra?: string | null
}

export const ESC_POS_DOTS_58MM = 384
export const ESC_POS_CHARS_58MM = 32
export const ESC_POS_CHARS_80MM = 48

const CP850_EXTENDED: Record<string, number> = {
  'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85,
  'å': 0x86, 'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8a, 'ï': 0x8b,
  'î': 0x8c, 'ì': 0x8d, 'Ä': 0x8e, 'Å': 0x8f, 'É': 0x90, 'æ': 0x91,
  'Æ': 0x92, 'ô': 0x93, 'ö': 0x94, 'ò': 0x95, 'û': 0x96, 'ù': 0x97,
  'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9a, 'ø': 0x9b, '£': 0x9c, 'Ø': 0x9d,
  '×': 0x9e, 'ƒ': 0x9f, 'á': 0xa0, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ª': 0xa6, 'º': 0xa7, '¿': 0xa8, '®': 0xa9,
  '¬': 0xaa, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf,
  'Á': 0xb5, 'Â': 0xb6, 'À': 0xb7, '©': 0xb8, 'Í': 0xd6, 'Ó': 0xe0,
  'Ú': 0xe9, 'µ': 0xe6, 'ß': 0xe1, '°': 0xf8, '·': 0xfa,
}

/** Encode text using CP850, the code page used by most ESC/POS clones for Spanish. */
export function encodeCp850(text: string): Uint8Array {
  const bytes: number[] = []
  for (const character of text.normalize('NFC')) {
    const codePoint = character.codePointAt(0) ?? 0x3f
    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (CP850_EXTENDED[character] !== undefined) {
      bytes.push(CP850_EXTENDED[character])
    } else {
      bytes.push(0x3f)
    }
  }
  return Uint8Array.from(bytes)
}

export function concatBytes(...arrays: Array<Uint8Array | undefined | null>): Uint8Array {
  const present = arrays.filter((value): value is Uint8Array => Boolean(value?.length))
  const length = present.reduce((sum, value) => sum + value.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const value of present) {
    result.set(value, offset)
    offset += value.length
  }
  return result
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, '')
  if (normalized.length % 2 !== 0 || /[^0-9a-f]/i.test(normalized)) {
    throw new Error('Cadena hexadecimal ESC/POS inválida')
  }
  const result = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    result[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return result
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function wrapText(text: string, width = ESC_POS_CHARS_80MM): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  const lines: string[] = []
  let line = ''
  for (const word of normalized.split(/\s+/)) {
    if (word.length > width) {
      if (line) {
        lines.push(line)
        line = ''
      }
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width))
      }
      continue
    }
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= width) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function textLine(text: string): Uint8Array {
  return concatBytes(encodeCp850(text), Uint8Array.of(0x0a))
}

function command(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes)
}

function safeText(value: string | null | undefined): string {
  return (value ?? '').replace(/[◆♦]/g, '-').replace(/[\r\n]+/g, ' ').trim()
}

function itemLines(label: string, price: string, width: number): string[] {
  const priceWidth = Math.min(Math.max(price.length, 1), width)
  const labelWidth = Math.max(1, width - priceWidth - 1)
  const chunks = wrapText(label, labelWidth)
  if (chunks.length === 0) return [price.padStart(width)]
  return chunks.map((chunk, index) => {
    if (index === 0) return `${chunk.slice(0, labelWidth).padEnd(labelWidth)} ${price.padStart(priceWidth)}`
    return chunk.slice(0, width)
  })
}

export interface BuildEscPosOptions {
  logoRaster?: Uint8Array | null
  cut?: boolean
  lineWidth?: number
}

/** Build a complete 80 mm ESC/POS job. logoRaster must already include its GS v 0 header. */
export function buildEscPosBytes(
  orderData: EscPosOrderData,
  settings: EscPosTicketSettings = {},
  options: BuildEscPosOptions = {},
): Uint8Array {
  const lineWidth = options.lineWidth ?? ESC_POS_CHARS_80MM
  const pieces: Uint8Array[] = []

  const INIT = command(0x1b, 0x40)
  const CODE_PAGE_CP850 = command(0x1b, 0x74, 0x02)
  const ALIGN_LEFT = command(0x1b, 0x61, 0x00)
  const ALIGN_CENTER = command(0x1b, 0x61, 0x01)
  const ALIGN_RIGHT = command(0x1b, 0x61, 0x02)
  const BOLD_ON = command(0x1b, 0x45, 0x01)
  const BOLD_OFF = command(0x1b, 0x45, 0x00)
  const FONT_NORMAL = command(0x1b, 0x4d, 0x00, 0x1d, 0x21, 0x00)
  const FONT_SMALL = command(0x1b, 0x4d, 0x01, 0x1d, 0x21, 0x00)
  const FONT_LARGE = command(0x1b, 0x4d, 0x00, 0x1d, 0x21, 0x11)
  const FEED_AND_PARTIAL_CUT = command(0x1d, 0x56, 0x42, 0x00)

  const fontSize = settings.ticket_tamano_fuente ?? 'normal'
  const itemFont = fontSize === 'pequena' ? FONT_SMALL : fontSize === 'grande' ? FONT_LARGE : FONT_NORMAL
  const separator = '-'.repeat(lineWidth)
  const businessName = safeText(settings.negocio_nombre ?? "Cristi's Coffe & Snack")
  const farewell = safeText(settings.ticket_mensaje_despedida ?? '¡Gracias por su compra! Vuelva pronto.')
  const showAttendant = settings.ticket_mostrar_atendido_por ?? true
  const showLogo = settings.ticket_mostrar_logo ?? true

  pieces.push(INIT, CODE_PAGE_CP850, ALIGN_CENTER)
  if (showLogo && options.logoRaster?.length) {
    pieces.push(options.logoRaster, command(0x0a))
  }
  pieces.push(BOLD_ON)
  for (const line of wrapText(businessName, lineWidth)) pieces.push(textLine(line))
  pieces.push(BOLD_OFF)

  const address = safeText(settings.negocio_direccion)
  const phone = safeText(settings.negocio_telefono)
  const rfc = safeText(settings.negocio_rfc)
  if (address) for (const line of wrapText(address, lineWidth)) pieces.push(textLine(line))
  if (phone) pieces.push(textLine(`Tel: ${phone}`.slice(0, lineWidth)))
  if (rfc) pieces.push(textLine(`RFC: ${rfc}`.slice(0, lineWidth)))

  pieces.push(command(0x0a))
  pieces.push(textLine(`Ticket: #${orderData.orderId.slice(0, 8).toUpperCase()}`))
  for (const line of wrapText(`Fecha: ${safeText(orderData.fecha)}`, lineWidth)) pieces.push(textLine(line))
  if (orderData.tipoPedido) {
    for (const line of wrapText(safeText(orderData.tipoPedido), lineWidth)) pieces.push(textLine(line))
  }
  if (showAttendant && orderData.atendidoPor) {
    for (const line of wrapText(`Atendido por: ${safeText(orderData.atendidoPor)}`, lineWidth)) pieces.push(textLine(line))
  }

  pieces.push(textLine(separator), ALIGN_LEFT, itemFont)

  for (const item of orderData.items) {
    const total = `$${(item.precio_unitario * item.cantidad).toFixed(2)}`
    const label = `${item.cantidad}x ${safeText(item.nombre)}`
    for (const line of itemLines(label, total, lineWidth)) pieces.push(textLine(line))

    if (item.variante_nombre) {
      for (const line of wrapText(`  - ${safeText(item.variante_nombre)}`, lineWidth)) pieces.push(textLine(line))
    }
    for (const extra of item.extras_pago ?? []) {
      const extraPrice = `$${(extra.precio * item.cantidad).toFixed(2)}`
      for (const line of itemLines(`  + ${safeText(extra.nombre)}`, extraPrice, lineWidth)) pieces.push(textLine(line))
    }
    if (item.extra_nombre && item.extra_precio != null) {
      const extraPrice = `$${(item.extra_precio * item.cantidad).toFixed(2)}`
      for (const line of itemLines(`  + ${safeText(item.extra_nombre)}`, extraPrice, lineWidth)) pieces.push(textLine(line))
    }
    if (item.ingredientes_seleccionados?.length) {
      const ingredients = item.ingredientes_seleccionados.map(safeText).filter(Boolean).join(', ')
      for (const line of wrapText(`  Con: ${ingredients}`, lineWidth)) pieces.push(textLine(line))
      if (item.cargo_ingredientes_extra) {
        pieces.push(textLine(`  Cargo extra: $${(item.cargo_ingredientes_extra * item.cantidad).toFixed(2)}`.slice(0, lineWidth)))
      }
    }
    if (item.notas) {
      for (const line of wrapText(`  Nota: ${safeText(item.notas)}`, lineWidth)) pieces.push(textLine(line))
    }
  }

  pieces.push(FONT_NORMAL, textLine(separator), ALIGN_RIGHT, BOLD_ON)
  pieces.push(textLine(`Total: $${orderData.total.toFixed(2)}`))
  pieces.push(BOLD_OFF)
  pieces.push(textLine(`Pagado con: ${safeText(orderData.metodoPago).toUpperCase()}`))
  if (orderData.montoRecibido != null) pieces.push(textLine(`Recibido: $${orderData.montoRecibido.toFixed(2)}`))
  if (orderData.cambio != null) pieces.push(textLine(`Cambio: $${orderData.cambio.toFixed(2)}`))

  pieces.push(command(0x0a, 0x0a), ALIGN_CENTER, FONT_NORMAL)
  const extraLine = safeText(settings.ticket_linea_extra)
  if (extraLine) for (const line of wrapText(extraLine, lineWidth)) pieces.push(textLine(line))
  for (const line of wrapText(farewell, lineWidth)) pieces.push(textLine(line))
  pieces.push(command(0x0a, 0x0a, 0x0a))
  if (options.cut !== false) pieces.push(FEED_AND_PARTIAL_CUT)

  return concatBytes(...pieces)
}

export function buildDiagnosticEscPosBytes(printerLabel = 'Impresora USB Android'): Uint8Array {
  const data: EscPosOrderData = {
    orderId: 'DIAGNOSTICO',
    items: [
      { nombre: 'Café, piñón y pingüino', cantidad: 1, precio_unitario: 45 },
      { nombre: 'Prueba negrita/alineación', cantidad: 1, precio_unitario: 0 },
    ],
    total: 45,
    metodoPago: 'PRUEBA',
    fecha: new Date().toLocaleString('es-MX'),
    tipoPedido: 'DIAGNÓSTICO USB',
    atendidoPor: printerLabel,
  }
  return buildEscPosBytes(data, {
    negocio_nombre: "Cristi's POS",
    negocio_direccion: 'Prueba: á é í ó ú Á É Í Ó Ú',
    negocio_telefono: 'ñ Ñ ü Ü ¿ ¡',
    ticket_mensaje_despedida: 'Si este texto y el corte salen bien, la conexión ESC/POS funciona.',
    ticket_mostrar_logo: false,
  })
}

export function buildCashDrawerKickCommand(): Uint8Array {
  return Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xfa])
}
