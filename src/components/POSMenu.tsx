'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { createOrder, addItemsToOrder } from '@/app/mesero/actions'
import { generateItemSignature } from '@/lib/orderUtils'

type Product = any
type Table = any
type Order = any
type Extra = any
type Ingredient = any

interface POSMenuProps {
  products: Product[]
  extras: Extra[]
  ingredients: Ingredient[]
  tables: Table[]
  liveOrders: Order[]
  employeeId: string
  targetOrderId?: string | null
  categoriesList?: { nombre: string; orden: number }[]
  onOrderCreated: () => void

  // Lifted state
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  orderType: string
  setOrderType: React.Dispatch<React.SetStateAction<string>>
  selectedTable: string
  setSelectedTable: React.Dispatch<React.SetStateAction<string>>
  nombreCliente: string
  setNombreCliente: React.Dispatch<React.SetStateAction<string>>
}

interface PaidExtra {
  extra_id: string
  nombre: string
  precio_adicional: number
}

export interface CartItem {
  id: string
  product: Product
  cantidad: number
  // Variante única (Caliente/Frío) — no cost
  variante?: Extra
  // Paid extras (Shot extra, Jarabe, etc.) — multiple allowed
  extrasPago: PaidExtra[]
  ingredientes_seleccionados?: string[]
  cargo_ingredientes_extra?: number
  notas?: string
}

export function POSMenu({
  products,
  extras,
  ingredients,
  tables,
  liveOrders,
  employeeId,
  targetOrderId,
  categoriesList,
  onOrderCreated,
  cart, setCart,
  orderType, setOrderType,
  selectedTable, setSelectedTable,
  nombreCliente, setNombreCliente
}: POSMenuProps) {
  // ── Cart ──────────────────────────────────────────────────────────────────
  const [activeShift, setActiveShift] = useState<'manana' | 'tarde'>('manana')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const [selectedExistingOrderId, setSelectedExistingOrderId] = useState<string>('')

  /*
   * Warn the user before closing/reloading the tab if there are items in the cart.
   * NOTE: 'beforeunload' support in iOS Safari has been progressively restricted
   * by Apple and may not show the confirmation dialog in PWA mode or on newer
   * iOS versions. This works reliably on Android Chrome and desktop browsers.
   * It is an extra safety net, not a guaranteed blocker on all devices.
   */
  useEffect(() => {
    if (cart.length === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [cart.length])

  // ── Auto-select target order fields ───────────────────────────────────────
  useEffect(() => {
    if (targetOrderId && liveOrders.length > 0) {
      const targetOrder = liveOrders.find((o: any) => o.id === targetOrderId)
      if (targetOrder) {
        setOrderType(targetOrder.tipo)
        if (targetOrder.tipo === 'mesa') {
          setSelectedTable(targetOrder.table_id)
          setSelectedExistingOrderId('')
          setNombreConfirmed(false)
        } else {
          setSelectedExistingOrderId(targetOrder.id)
          setNombreCliente(targetOrder.nombre_cliente || '')
          setNombreConfirmed(true)
          setSelectedTable('')
        }
      }
    }
  }, [targetOrderId, liveOrders, setOrderType, setSelectedTable, setNombreCliente])

  // ── Options modal ─────────────────────────────────────────────────────────
  const [optionsModalOpen, setOptionsModalOpen] = useState(false)
  const [selectedProductForOptions, setSelectedProductForOptions] = useState<Product | null>(null)
  // Variante única seleccionada (solo una)
  const [selectedVarianteId, setSelectedVarianteId] = useState<string | null>(null)
  // Extras de pago seleccionados (múltiples)
  const [selectedExtrasPago, setSelectedExtrasPago] = useState<string[]>([])
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([])
  const [flashId, setFlashId] = useState<string | null>(null)
  const [selectorCollapsed, setSelectorCollapsed] = useState(false)
  const [nombreConfirmed, setNombreConfirmed] = useState(false)

  // ── Productos ─────────────────────────────────────────────────────────────
  const shiftProducts = products.filter(p => p.turno === 'todo_dia' || p.turno === activeShift)
  const uniqueCategories = Array.from(new Set(shiftProducts.map(p => p.categoria)))
  const categories = categoriesList 
    ? uniqueCategories.sort((a, b) => {
        const nameA = a || ''
        const nameB = b || ''
        const catA = categoriesList.find(c => c.nombre.toLowerCase() === nameA.toLowerCase())
        const catB = categoriesList.find(c => c.nombre.toLowerCase() === nameB.toLowerCase())
        const orderA = catA ? catA.orden : 999
        const orderB = catB ? catB.orden : 999
        return orderA - orderB || nameA.localeCompare(nameB)
      })
    : uniqueCategories.sort((a, b) => (a || '').localeCompare(b || ''))
  const filteredProducts = selectedCategory
    ? shiftProducts.filter(p => p.categoria === selectedCategory)
    : shiftProducts

  // Extras for the currently-selected product, split by type
  const allApplicableExtras = selectedProductForOptions
    ? extras.filter(
        e => (e.categoria_aplicable === selectedProductForOptions.categoria || e.producto_id === selectedProductForOptions.id) && e.activo
      )
    : []
  const variantesForProduct = allApplicableExtras.filter((e: Extra) => e.es_variante_unica)
  const extrasPagoForProduct = allApplicableExtras.filter((e: Extra) => !e.es_variante_unica)

  const applicableIngredients = selectedProductForOptions
    ? ingredients.filter(i => i.producto_id === selectedProductForOptions.id)
    : []

  // ── Cart handlers ─────────────────────────────────────────────────────────
  const handleProductClick = (product: Product) => {
    // Inventory check: if product manages inventory and is out of stock, block
    if (product.maneja_inventario && (product.stock_actual ?? 0) <= 0) {
      return alert(`Ya no hay existencias de "${product.nombre}"`)
    }
    // Inventory check: if the cart already has the maximum allowed quantity
    if (product.maneja_inventario && product.stock_actual != null) {
      const inCart = cart.filter(i => i.product.id === product.id).reduce((s, i) => s + i.cantidad, 0)
      if (inCart >= product.stock_actual) {
        return alert(`Ya no hay más existencias de "${product.nombre}" (stock: ${product.stock_actual})`)
      }
    }
    const productExtras = extras.filter(
      e => (e.categoria_aplicable === product.categoria || e.producto_id === product.id) && e.activo
    )
    const hasIngredientes = product.ingredientes_incluidos != null
    const hasExtras = productExtras.length > 0

    if (hasExtras || hasIngredientes) {
      setSelectedProductForOptions(product)
      setSelectedVarianteId(null)
      setSelectedExtrasPago([])
      setSelectedIngredients([])
      setOptionsModalOpen(true)
    } else {
      addToCart(product, null, [], [], undefined, 0)
    }

    setFlashId(product.id)
    setTimeout(() => setFlashId(null), 350)
  }

  const toggleIngredient = (name: string) =>
    setSelectedIngredients(prev =>
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    )

  const toggleExtraPago = (extraId: string) =>
    setSelectedExtrasPago(prev =>
      prev.includes(extraId) ? prev.filter(id => id !== extraId) : [...prev, extraId]
    )

  const addToCart = (
    product: Product,
    variante: Extra | null,
    extrasPagoIds: string[],
    extrasLookup: Extra[],
    ings?: string[],
    ingCharge?: number
  ) => {
    const extrasPago: PaidExtra[] = extrasPagoIds.map(id => {
      const e = extrasLookup.find((ex: Extra) => ex.id === id)!
      return { extra_id: e.id, nombre: e.nombre, precio_adicional: e.precio_adicional }
    })

    const newItemBase = {
      product_id: product.id,
      variante_id: variante?.id,
      extrasPago,
      ingredientes_seleccionados: ings?.length ? ings : undefined,
    }
    const signature = generateItemSignature(newItemBase)

    setCart(prev => {
      const existing = prev.find(i => generateItemSignature({ ...i, product_id: i.product.id, variante_id: i.variante?.id }) === signature)
      if (existing) {
        return prev.map(i => i.id === existing.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      }
      return [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        product,
        cantidad: 1,
        variante: variante || undefined,
        extrasPago,
        ingredientes_seleccionados: ings?.length ? ings : undefined,
        cargo_ingredientes_extra: ingCharge || 0,
      }]
    })
    setOptionsModalOpen(false)
  }

  const handleConfirmOptions = () => {
    if (!selectedProductForOptions) return
    const variante = variantesForProduct.find((e: Extra) => e.id === selectedVarianteId) || null

    let ingCharge = 0
    if (
      selectedProductForOptions.ingredientes_incluidos != null &&
      selectedIngredients.length > selectedProductForOptions.ingredientes_incluidos
    ) {
      ingCharge =
        (selectedIngredients.length - selectedProductForOptions.ingredientes_incluidos) *
        selectedProductForOptions.precio_ingrediente_extra
    }

    addToCart(
      selectedProductForOptions,
      variante,
      selectedExtrasPago,
      extrasPagoForProduct,
      selectedIngredients,
      ingCharge
    )
  }

  const removeFromCart = (id: string) =>
    setCart(prev => {
      const item = prev.find(i => i.id === id)
      if (item && item.cantidad > 1) return prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad - 1 } : i)
      return prev.filter(i => i.id !== id)
    })

  const addOneMore = (id: string) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad + 1 } : i))

  const updateItemNote = (id: string, notas: string) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, notas } : i))

  const splitOneWithNote = (id: string) => {
    setCart(prev => {
      const itemIndex = prev.findIndex(i => i.id === id)
      if (itemIndex === -1 || prev[itemIndex].cantidad <= 1) return prev
      const item = prev[itemIndex]
      const updatedItem = { ...item, cantidad: item.cantidad - 1 }
      const newItem = { ...item, id: Math.random().toString(36).substr(2, 9), cantidad: 1, notas: '' }
      const newCart = [...prev]
      newCart[itemIndex] = updatedItem
      newCart.splice(itemIndex + 1, 0, newItem)
      return newCart
    })
  }

  const activeOrderToAppend = targetOrderId
    ? liveOrders.find(o => o.id === targetOrderId && o.estado === 'abierto')
    : orderType === 'mesa' && selectedTable
      ? liveOrders.find(o => o.tipo === 'mesa' && o.table_id === selectedTable && o.estado === 'abierto')
      : (orderType === 'para_llevar' || orderType === 'domicilio') && selectedExistingOrderId
        ? liveOrders.find(o => o.id === selectedExistingOrderId && o.estado === 'abierto')
        : null

  const handleCreateOrder = async () => {
    if (cart.length === 0) return alert('El carrito está vacío')
    if (orderType === 'mesa' && !selectedTable) return alert('Selecciona una mesa')
    if ((orderType === 'para_llevar' || orderType === 'domicilio') && !nombreCliente.trim()) return alert('Ingresa el nombre del cliente')
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    console.log('[DEBUG Agregar Más] targetOrderId:', targetOrderId)
    console.log('[DEBUG Agregar Más] selectedExistingOrderId:', selectedExistingOrderId)
    console.log('[DEBUG Agregar Más] orderType:', orderType)
    console.log('[DEBUG Agregar Más] activeOrderToAppend:', activeOrderToAppend?.id)

    // Generate ONE key per genuine click — if the network retries the same
    // request, it will carry this same key and be deduped on the server.
    // A new genuine click always generates a new key.
    const idempotencyKey = crypto.randomUUID()
    setIsSubmitting(true)
    
    // Expand cart items: instead of { cantidad: 3 }, send 3 separate objects with cantidad: 1
    const itemsData: any[] = []
    cart.forEach(item => {
      for (let i = 0; i < item.cantidad; i++) {
        itemsData.push({
          product_id: item.product.id,
          cantidad: 1,
          precio_unitario: item.product.precio,
          nombre_producto: item.product.nombre,
          // Variante única
          variante_id: item.variante?.id || undefined,
          nombre_variante: item.variante?.nombre || undefined,
          // Paid extras → to order_item_extras
          extras_pago: item.extrasPago.map(ep => ({
            extra_id: ep.extra_id,
            nombre_extra: ep.nombre,
            precio_adicional: ep.precio_adicional,
          })),
          ingredientes_seleccionados: item.ingredientes_seleccionados,
          cargo_ingredientes_extra: item.cargo_ingredientes_extra,
          notas: item.notas,
        })
      }
    })
    try {
      let res;
      if (activeOrderToAppend) {
        console.log('[DEBUG Agregar Más] Calling addItemsToOrder for order:', activeOrderToAppend.id)
        res = await addItemsToOrder(activeOrderToAppend.id, itemsData, employeeId, idempotencyKey)
      } else {
        console.log('[DEBUG Agregar Más] Calling createOrder')
        res = await createOrder(orderType, orderType === 'mesa' ? selectedTable : null, itemsData, employeeId, orderType === 'mesa' ? '' : nombreCliente, idempotencyKey)
      }

      if (res?.error) {
        alert('Error: ' + res.error)
      } else {
        if (activeOrderToAppend) {
          // Appended to existing order — keep selection so mesero can add more items
          // without having to re-pick the client. Only clear the cart.
        } else {
          // Brand new order created — full reset
          setSelectedExistingOrderId('')
          setSelectorCollapsed(false)
          setNombreConfirmed(false)
        }
        onOrderCreated()
      }
    } catch (err: any) {
      alert('Error inesperado al crear pedido: ' + err.message)
    } finally {
      setIsSubmitting(false)
      isSubmittingRef.current = false
    }
  }

  // Compute item-level extra cost for display
  const itemExtraCost = (item: CartItem) =>
    item.extrasPago.reduce((acc, ep) => acc + ep.precio_adicional, 0)

  const cartTotal = cart.reduce(
    (acc, item) =>
      acc + (item.product.precio + itemExtraCost(item) + (item.cargo_ingredientes_extra || 0)) * item.cantidad,
    0
  )

  // Modal: running extra cost
  const currentExtraCost = selectedExtrasPago.reduce((acc, id) => {
    const e = extrasPagoForProduct.find((ex: Extra) => ex.id === id)
    return acc + (e?.precio_adicional || 0)
  }, 0)
  let currentIngCharge = 0
  if (
    selectedProductForOptions?.ingredientes_incluidos != null &&
    selectedIngredients.length > selectedProductForOptions.ingredientes_incluidos
  ) {
    currentIngCharge =
      (selectedIngredients.length - selectedProductForOptions.ingredientes_incluidos) *
      selectedProductForOptions.precio_ingrediente_extra
  }

  return (
    <div className="flex flex-col md:flex-row gap-0 h-full w-full min-h-0">
      {/* ── Panel izquierdo (Menú) ────────────────────────────────────── */}
      <div className="flex-1 md:border-r border-[var(--color-gris)]/20 overflow-hidden flex flex-col min-h-[55dvh] md:min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="bg-gray-50 p-2 flex justify-end gap-2 border-b border-[var(--color-gris)]/10">
            <span className="text-xs font-bold text-[var(--color-gris)] uppercase self-center mr-2">Turno:</span>
            <Button size="sm" variant={activeShift === 'manana' ? 'primary' : 'outline'} onClick={() => { setActiveShift('manana'); setSelectedCategory(null) }}>Desayunos</Button>
            <Button size="sm" variant={activeShift === 'tarde' ? 'primary' : 'outline'} onClick={() => { setActiveShift('tarde'); setSelectedCategory(null) }}>Tarde</Button>
          </div>
          <div className="relative border-b border-[var(--color-gris)]/10">
            <div className="p-4 flex gap-2 overflow-x-auto hide-scrollbar">
              <Button variant={selectedCategory === null ? 'primary' : 'outline'} size="md" className="py-3 px-4 text-base whitespace-nowrap" onClick={() => setSelectedCategory(null)}>Todos</Button>
              {categories.map(cat => (
                <Button key={cat} variant={selectedCategory === cat ? 'primary' : 'outline'} size="md" className="py-3 px-4 text-base whitespace-nowrap" onClick={() => setSelectedCategory(cat)}>{cat}</Button>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent" />
          </div>
          <div className="flex-1 min-h-0 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4 overflow-y-auto content-start">
            {filteredProducts.map(p => {
              const agotado = p.maneja_inventario && (p.stock_actual ?? 0) <= 0
              return (
                <div
                  key={p.id}
                  className={`border rounded-lg p-4 flex flex-col h-full shadow-sm transition-all duration-200 relative ${
                    agotado
                      ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed'
                      : 'border-[var(--color-gris)]/20 bg-white cursor-pointer hover:border-[var(--color-bronce)] active:scale-95'
                  } ${flashId === p.id ? 'ring-2 ring-[var(--color-bronce)] scale-[1.03]' : ''}`}
                  onClick={() => !agotado && handleProductClick(p)}
                >
                  {flashId === p.id && (
                    <span className="absolute -top-2 -right-2 bg-[var(--color-bronce)] text-white font-bold text-xs px-2 py-0.5 rounded-full z-20 animate-bounce">
                      +1
                    </span>
                  )}
                  {agotado && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <span className="bg-gray-700/80 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full">Agotado</span>
                    </div>
                  )}
                  <div className="aspect-square bg-[var(--color-crema)] rounded-md mb-2 relative overflow-hidden flex items-center justify-center max-w-[140px] w-full mx-auto">
                    {p.foto_url
                      ? <Image src={p.foto_url} alt={p.nombre} fill sizes="(max-width: 768px) 50vw, 180px" className="object-cover" loading="lazy" />
                      : <span className="text-3xl opacity-40">☕</span>}
                  </div>
                  <div className="font-serif font-bold mt-auto leading-tight mb-1 text-[var(--color-negro)] text-lg">{p.nombre}</div>
                  <div className="text-[var(--color-bronce)] font-semibold text-base">${p.precio}</div>
                  {p.maneja_inventario && !agotado && (
                    <div className="text-[10px] text-[var(--color-gris)] mt-0.5">📦 {p.stock_actual}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Carrito ─────────────────────── */}
      <div className="md:w-80 lg:w-96 xl:w-[420px] flex-shrink-0 bg-white flex flex-col h-[70dvh] md:h-full border-l border-[var(--color-gris)]/10 rounded-b-xl md:rounded-none">
        <div className="p-4 bg-[var(--color-crema)] border-b border-[var(--color-bronce)]/20 flex-shrink-0">
          <h2 className="font-serif font-bold text-xl text-[var(--color-bronce)]">Orden Actual</h2>
        </div>

        {(() => {
          const orderResolved = orderType === 'mesa' ? !!selectedTable : !!(selectedExistingOrderId || nombreConfirmed)
          const showCompactSelector = orderResolved && cart.length > 0 && !selectorCollapsed

          return (
            <>
              {showCompactSelector && (
                <div className="flex items-center justify-between bg-[var(--color-crema)] rounded-lg px-3 py-2 flex-shrink-0 m-4 mb-0 border border-[var(--color-bronce)]/20">
                  <span className="text-sm font-bold text-[var(--color-bronce)]">
                    {orderType === 'mesa'
                      ? `Mesa ${tables.find((t: any) => t.id === selectedTable)?.numero}`
                      : `${orderType === 'domicilio' ? 'Domicilio' : 'Para llevar'} — ${nombreCliente || 'Sin nombre'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectorCollapsed(true)}
                    className="text-xs font-semibold text-[var(--color-bronce)] underline"
                  >
                    Cambiar
                  </button>
                </div>
              )}

              <div className={`p-4 border-b border-[var(--color-gris)]/20 space-y-4 flex-shrink-0 overflow-y-auto max-h-[40vh] md:max-h-[45vh] ${showCompactSelector ? 'hidden' : ''}`}>
          <div>
            <label className="text-xs font-bold tracking-widest text-[var(--color-gris)] uppercase mb-2 block">Tipo de Pedido</label>
            <div className="flex gap-2">
              <Button variant={orderType === 'mesa' ? 'primary' : 'outline'} className="flex-1 py-4 text-sm font-semibold" onClick={() => { setOrderType('mesa'); setSelectedExistingOrderId(''); setSelectorCollapsed(false); setNombreConfirmed(false); setNombreCliente('') }}>Mesa</Button>
              <Button variant={orderType === 'para_llevar' ? 'primary' : 'outline'} className="flex-1 py-4 text-sm font-semibold" onClick={() => { setOrderType('para_llevar'); setSelectedExistingOrderId(''); setSelectorCollapsed(false); setNombreConfirmed(false); setNombreCliente('') }}>Llevar</Button>
              <Button variant={orderType === 'domicilio' ? 'primary' : 'outline'} className="flex-1 py-4 text-sm font-semibold" onClick={() => { setOrderType('domicilio'); setSelectedExistingOrderId(''); setSelectorCollapsed(false); setNombreConfirmed(false); setNombreCliente('') }}>Domicilio</Button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold tracking-widest text-[var(--color-gris)] uppercase mb-2 block">
              {orderType === 'mesa' ? 'Mesa' : 'Nombre Cliente (obligatorio)'}
            </label>
            {orderType === 'mesa' ? (
              <div className="grid grid-cols-3 [@media(min-width:768px)_and_(max-width:1366px)]:grid-cols-4 gap-3">
                {tables.map((t: any) => {
                  const openOrder = liveOrders.find(
                    (o: any) => o.tipo === 'mesa' && o.table_id === t.id && o.estado === 'abierto'
                  )
                  const isOccupied = !!openOrder
                  const openTotal = isOccupied
                    ? openOrder.order_items?.reduce((sum: number, i: any) => sum + (i.cantidad * i.precio_unitario), 0) ?? 0
                    : 0
                  const openItemCount = isOccupied
                    ? openOrder.order_items?.reduce((sum: number, i: any) => sum + i.cantidad, 0) ?? 0
                    : 0
                  const isSelected = selectedTable === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setSelectedTable(t.id); setSelectorCollapsed(false) }}
                      className={`rounded-lg py-3 px-2 text-center text-sm font-bold border-2 transition-all ${
                        isSelected
                          ? isOccupied
                            ? 'border-amber-500 bg-amber-100 text-amber-800'
                            : 'border-[var(--color-bronce)] bg-[var(--color-crema)] text-[var(--color-bronce)]'
                          : isOccupied
                            ? 'border-amber-300 bg-amber-50 text-amber-700'
                            : 'border-gray-200 bg-white text-[var(--color-negro)] hover:border-[var(--color-bronce)]'
                      }`}
                    >
                      <div>Mesa {t.numero}</div>
                      {isOccupied ? (
                        <div className="text-[9px] font-normal mt-0.5 leading-tight">
                          <span className="font-semibold">🔴 Cuenta abierta</span><br/>
                          ${openTotal.toFixed(2)} &middot; {openItemCount} items
                        </div>
                      ) : (
                        <div className="text-[9px] font-normal mt-0.5 text-green-600">✓ Libre</div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (() => {
              const openOfType = liveOrders.filter(
                (o: any) => o.tipo === orderType && o.estado === 'abierto'
              )
              return (
                <div className="space-y-2">
                  {/* Open orders quick-select */}
                  {openOfType.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[var(--color-gris)] uppercase font-bold tracking-widest mb-1">Agregar a pedido existente</p>
                      <div className="flex flex-wrap gap-1.5">
                        {openOfType.map((o: any) => {
                          const label = o.nombre_cliente?.trim() || `Pedido #${o.id.slice(-4)}`
                          const itemCount = o.order_items?.reduce((s: number, i: any) => s + i.cantidad, 0) ?? 0
                          const total = o.order_items?.reduce((s: number, i: any) => s + i.cantidad * i.precio_unitario, 0) ?? 0
                          const isActive = selectedExistingOrderId === o.id
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                if (isActive) {
                                  setSelectedExistingOrderId('')
                                } else {
                                  setSelectedExistingOrderId(o.id)
                                  setNombreCliente(o.nombre_cliente || '')
                                  setSelectorCollapsed(false)
                                  setNombreConfirmed(false)
                                }
                              }}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border-2 transition-all text-left ${
                                isActive
                                  ? 'border-amber-500 bg-amber-100 text-amber-800'
                                  : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400'
                              }`}
                            >
                              <div>{label}</div>
                              <div className="text-[9px] font-normal">{itemCount} items · ${total.toFixed(2)}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* Name input — disabled when appending to existing order */}
                  <div>
                    {openOfType.length > 0 && (
                      <p className="text-[10px] text-[var(--color-gris)] uppercase font-bold tracking-widest mb-1">O crear pedido nuevo</p>
                    )}
                    <input
                      type="text"
                      placeholder="Nombre para identificar este pedido (ej. Juan)"
                      className={`w-full bg-white p-2 rounded border transition ${
                        selectedExistingOrderId
                          ? 'border-[var(--color-gris)]/30 text-[var(--color-gris)] cursor-not-allowed bg-gray-50'
                          : 'border-[var(--color-gris)]'
                      }`}
                      value={nombreCliente}
                      disabled={!!selectedExistingOrderId}
                      onFocus={() => setNombreConfirmed(false)}
                      onBlur={() => setNombreConfirmed(!!nombreCliente.trim())}
                      onChange={(e) => {
                        const typed = e.target.value
                        setNombreCliente(typed)
                        setSelectorCollapsed(false)
                        // Auto-match: if the typed name exactly matches an open order of the same
                        // type, select it automatically (prevents accidental duplicate orders).
                        const match = openOfType.find(
                          (o: any) =>
                            (o.nombre_cliente || '').trim().toLowerCase() === typed.trim().toLowerCase()
                        )
                        if (match) {
                          setSelectedExistingOrderId(match.id)
                        } else {
                          setSelectedExistingOrderId('')  // no match = new order
                        }
                      }}
                    />
                  </div>
                </div>
              )
            })()
            }
          </div>
        </div>
        </>
        )
        })()}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 [@media(min-width:768px)_and_(max-width:1366px)]:min-h-[180px] [@media(min-width:768px)_and_(max-width:1366px)]:bg-[var(--color-crema)]/20 [@media(min-width:768px)_and_(max-width:1366px)]:border-t [@media(min-width:768px)_and_(max-width:1366px)]:border-[var(--color-gris)]/10">
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-6xl mb-3">🧾</div>
              <p className="text-[var(--color-gris)] text-lg font-semibold">Agrega productos tocando el menú</p>
            </div>
          )}
          {cart.length > 0 && (
            <p className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest [@media(min-width:768px)_and_(max-width:1366px)]:block hidden">
              Productos agregados
            </p>
          )}
          {cart.map(item => (
            <div key={item.id} className="flex justify-between items-start bg-gray-50 p-2 [@media(min-width:768px)_and_(max-width:1366px)]:p-3 rounded-lg border border-[var(--color-gris)]/10">
              <div className="flex-1 pr-2">
                <div className="font-bold text-sm">{item.product.nombre}</div>
                {/* Variante única */}
                {item.variante && (
                  <div className="text-purple-600 text-xs font-semibold mt-0.5">
                    ◆ {item.variante.nombre}
                  </div>
                )}
                {/* Extras de pago */}
                {item.extrasPago.length > 0 && (
                  <div className="space-y-0.5 mt-0.5">
                    {item.extrasPago.map(ep => (
                      <div key={ep.extra_id} className="text-[var(--color-bronce)] text-xs">
                        + {ep.nombre} <span className="font-bold">+${ep.precio_adicional}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Ingredientes */}
                {item.ingredientes_seleccionados?.length! > 0 && (
                  <div className="text-[var(--color-gris)] text-[10px]">
                    Con: {item.ingredientes_seleccionados!.join(', ')}
                    {item.cargo_ingredientes_extra! > 0 && ` (+$${item.cargo_ingredientes_extra})`}
                  </div>
                )}
                <div className="text-[var(--color-bronce)] text-xs font-bold mt-1">
                  ${(item.product.precio + itemExtraCost(item) + (item.cargo_ingredientes_extra || 0)).toFixed(2)} c/u
                </div>
                <input
                  type="text"
                  placeholder="Nota. Ej: sin cebolla"
                  className="mt-2 w-full text-xs p-1.5 border border-[var(--color-gris)]/20 rounded bg-white focus:outline-none focus:border-[var(--color-bronce)]"
                  value={item.notas || ''}
                  onChange={e => updateItemNote(item.id, e.target.value)}
                />
              </div>
              <div className="flex flex-col items-end gap-2 mt-1">
                <div className="flex items-center gap-1 bg-white border border-[var(--color-gris)]/20 rounded-md p-1">
                  <button className="w-9 h-9 flex items-center justify-center font-bold text-lg hover:bg-gray-100 rounded" onClick={() => removeFromCart(item.id)}>-</button>
                  <span className="font-bold w-5 text-center text-sm">{item.cantidad}</span>
                  <button className="w-9 h-9 flex items-center justify-center font-bold text-lg hover:bg-gray-100 rounded" onClick={() => addOneMore(item.id)}>+</button>
                </div>
                {item.cantidad > 1 && (
                  <button 
                    onClick={() => splitOneWithNote(item.id)}
                    className="text-[10px] text-[var(--color-bronce)] font-semibold flex items-center gap-1 hover:underline"
                  >
                    ✂️ Separar 1 con nota
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-gray-50 border-t border-[var(--color-gris)]/20 safe-bottom flex-shrink-0 sticky bottom-0 z-10">
          <div className="flex justify-between items-center mb-4 text-lg font-bold">
            <span>Total</span>
            <span>${cartTotal.toFixed(2)}</span>
          </div>
          {/* Warning: adding to existing open order */}
          {!targetOrderId && activeOrderToAppend && cart.length === 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <div className="font-bold text-sm mb-0.5">⚠️ Cuenta ya abierta</div>
              {orderType === 'mesa'
                ? <>Estás <strong>agregando a la cuenta</strong> de Mesa {tables.find((t: any) => t.id === selectedTable)?.numero}.</>
                : <>Estás <strong>agregando al pedido</strong> de <strong>{activeOrderToAppend.nombre_cliente || 'Sin nombre'}</strong>.</>
              }
              {' '}Actualmente tiene {activeOrderToAppend.order_items?.reduce((s: number, i: any) => s + i.cantidad, 0) ?? 0} items
              {' '}por ${(activeOrderToAppend.order_items?.reduce((s: number, i: any) => s + i.cantidad * i.precio_unitario, 0) ?? 0).toFixed(2)}.
              <br/>Si no es correcto, {orderType === 'mesa' ? 'elige otra mesa' : 'deselecciona el pedido o escribe un nombre nuevo'}.
            </div>
          )}
          <Button
            className="w-full h-14 text-lg"
            onClick={handleCreateOrder}
            disabled={cart.length === 0 || isSubmitting || (orderType === 'mesa' && !selectedTable) || ((orderType === 'para_llevar' || orderType === 'domicilio') && !nombreCliente.trim())}
          >
            {activeOrderToAppend ? 'Agregar al Pedido' : 'Crear Pedido'}
          </Button>
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────── */}
      <Modal isOpen={optionsModalOpen} onClose={() => setOptionsModalOpen(false)} title="Opciones de Producto">
        {selectedProductForOptions && (
          <div className="space-y-5 max-h-[70dvh] overflow-y-auto pr-2">
            <div className="flex justify-between items-center">
              <p className="font-bold text-xl">{selectedProductForOptions.nombre}</p>
              <span className="font-bold text-[var(--color-bronce)]">
                ${(selectedProductForOptions.precio + currentExtraCost + currentIngCharge).toFixed(2)}
              </span>
            </div>

            {/* ── Variantes únicas (Caliente / Frío) ── */}
            {variantesForProduct.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-purple-700 uppercase tracking-wider">
                  ◆ Elige una opción <span className="text-[10px] font-normal text-purple-400">(sin costo)</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {variantesForProduct.map((v: Extra) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVarianteId(prev => prev === v.id ? null : v.id)}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-bold transition-all ${
                        selectedVarianteId === v.id
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-[var(--color-gris)]/20 text-[var(--color-gris)] hover:border-purple-300'
                      }`}
                    >
                      {v.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Extras de pago (múltiple selección) ── */}
            {extrasPagoForProduct.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-[var(--color-gris)] uppercase tracking-wider">
                  Extras opcionales
                </p>
                {extrasPagoForProduct.map((extra: Extra) => (
                  <label key={extra.id} className="flex justify-between items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedExtrasPago.includes(extra.id)}
                        onChange={() => toggleExtraPago(extra.id)}
                        className="w-5 h-5 rounded text-[var(--color-bronce)] accent-[var(--color-bronce)]"
                      />
                      <span className="font-semibold text-sm">{extra.nombre}</span>
                    </div>
                    <span className="text-[var(--color-bronce)] font-bold text-sm">+${extra.precio_adicional}</span>
                  </label>
                ))}
                {currentExtraCost > 0 && (
                  <p className="text-right text-sm font-bold text-[var(--color-bronce)]">
                    Extras: +${currentExtraCost.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* ── Ingredientes ── */}
            {applicableIngredients.length > 0 && (
              <div className="space-y-3">
                <div className="bg-[var(--color-crema)] p-3 rounded-lg border border-[var(--color-bronce)]/20">
                  <p className="text-sm font-bold text-[var(--color-bronce)]">
                    Ingredientes (Elige hasta {selectedProductForOptions.ingredientes_incluidos} gratis)
                  </p>
                  <p className="text-xs text-[var(--color-gris)]">Extras cuestan +${selectedProductForOptions.precio_ingrediente_extra} c/u</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {applicableIngredients.map((ing: any) => (
                    <label key={ing.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-gray-50 text-sm">
                      <input type="checkbox" checked={selectedIngredients.includes(ing.nombre)} onChange={() => toggleIngredient(ing.nombre)} className="w-4 h-4 rounded text-[var(--color-bronce)]" />
                      <span className="font-semibold">{ing.nombre}</span>
                    </label>
                  ))}
                </div>
                {currentIngCharge > 0 && <p className="text-right text-sm font-bold text-[var(--color-bronce)]">Cargo extra: +${currentIngCharge}</p>}
              </div>
            )}

            <Button className="w-full h-14 text-lg sticky bottom-0 safe-bottom" onClick={handleConfirmOptions}>
              Agregar al Pedido
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
