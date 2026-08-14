export interface BaseOrderItem {
  id?: string
  product_id?: string
  variante_id?: string
  extra_id?: string
  order_item_extras?: any[]
  extrasPago?: any[] // Formato carrito
  ingredientes_seleccionados?: string[] | null
  notas?: string | null
  [key: string]: any
}

/**
 * Genera una firma única para un producto basada en sus características.
 * Si dos productos tienen la misma firma, se consideran "idénticos" y pueden agruparse.
 */
export function generateItemSignature(item: BaseOrderItem): string {
  const parts: string[] = []

  // 1. Producto base
  parts.push(`p:${item.product_id || 'unknown'}`)

  // 2. Variante única (si existe)
  if (item.variante_id) {
    parts.push(`v:${item.variante_id}`)
  }

  // 3. Extras de pago (Legacy extra_id + nuevos order_item_extras)
  const extrasList: string[] = []
  if (item.extra_id) extrasList.push(item.extra_id)
  
  // Soportar tanto formato de Base de Datos (order_item_extras) como formato de Carrito (extrasPago)
  const paidExtras = item.order_item_extras || item.extrasPago || []
  paidExtras.forEach((ep: any) => {
    if (ep.extra_id) extrasList.push(ep.extra_id)
  })

  if (extrasList.length > 0) {
    extrasList.sort()
    parts.push(`e:[${extrasList.join(',')}]`)
  }

  // 4. Ingredientes seleccionados (si aplica)
  if (item.ingredientes_seleccionados && item.ingredientes_seleccionados.length > 0) {
    const ings = [...item.ingredientes_seleccionados].sort()
    parts.push(`i:[${ings.join(',')}]`)
  }

  // 5. Notas (exact match)
  if (item.notas && item.notas.trim() !== '') {
    parts.push(`n:${item.notas.trim()}`)
  }

  return parts.join('|')
}

export interface GroupedOrderItem {
  signature: string
  cantidad_total: number
  ids: string[]
  representante: any // Toma el primer elemento del grupo para extraer nombres y precios base
  items_originales: any[]
}

/**
 * Agrupa un arreglo de order_items de la base de datos basándose en su firma.
 */
export function groupOrderItems(items: any[]): GroupedOrderItem[] {
  const groups = new Map<string, GroupedOrderItem>()

  items.forEach(item => {
    const sig = generateItemSignature(item)
    if (groups.has(sig)) {
      const g = groups.get(sig)!
      g.cantidad_total += (item.cantidad || 1)
      g.ids.push(item.id)
      g.items_originales.push(item)
    } else {
      groups.set(sig, {
        signature: sig,
        cantidad_total: item.cantidad || 1,
        ids: [item.id],
        representante: item,
        items_originales: [item]
      })
    }
  })

  return Array.from(groups.values())
}

/**
 * Calcula el total de un pedido basándose en sus order_items.
 */
export function calcTotal(items: any[]) {
  return items
    .filter(i => !i.cancelado)
    .reduce((acc, i) => {
      const extraMultipleCost = (i.order_item_extras || []).reduce((sum: number, ext: any) => sum + (ext.precio_adicional || 0), 0)
      return acc + (i.precio_unitario + (i.extra_precio || 0) + extraMultipleCost + (i.cargo_ingredientes_extra || 0)) * i.cantidad
    }, 0)
}
