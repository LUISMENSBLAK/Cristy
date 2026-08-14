'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { playPedidoListo, playItemListo, unlockAudio } from '@/utils/sound'
import { ToastContainer, useToasts } from '@/components/ui/Toast'
import { createOrder, sendToKitchen, cancelOrderItem, deleteOrderItemUnsent, addItemsToOrder } from './actions'
import { imprimirTicketCocina, PrintOrderData } from '@/utils/printTicket'
import { POSMenu } from '@/components/POSMenu'
import { useCartState } from '@/hooks/useCartState'
import { formatOrderType, getOrderTypeColorClass } from '@/lib/utils'
import { groupOrderItems, GroupedOrderItem, calcTotal } from '@/lib/orderUtils'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { ChevronDown, ChevronUp } from 'lucide-react'

type Product = any
type Table = any
type Order = any
type Extra = any
type Ingredient = any

/**
 * Nota sobre el Sistema de Turnos e Ingredientes:
 * Este sistema permite filtrar productos por turno (mañana/tarde/todo el día)
 * y personalizar las recetas agregando ingredientes o extras con costo adicional 
 * (ej. crepas armables). 
 * 
 * Es importante aclarar que esto es PURAMENTE para "personalización de receta" 
 * y flexibilidad de venta. NO es un sistema de control de inventario: no lleva 
 * conteos, existencias, ni alertas de stock, para mantener la simplicidad del POS.
 */

interface MeseroViewProps {
  products: Product[]
  extras: Extra[]
  ingredients: Ingredient[]
  tables: Table[]
  initialActiveOrders: Order[]
  employeeId: string
  employeeName: string
  categoriesList?: { id: string; nombre: string; orden: number }[]
  settings?: any
}

interface CartItem {
  id: string
  product: Product
  cantidad: number
  extra?: Extra
  ingredientes_seleccionados?: string[]
  cargo_ingredientes_extra?: number
}

const CANCEL_REASONS = [
  'Cliente cambió de opinión',
  'No había el producto',
  'Error al capturar',
  'Otro',
]

// ─── Helper: calcular total de un pedido (movido a orderUtils) ────────────────────────────────────

// ─── Badge de estado del pedido ─────────────────────────────────────────────
function OrderStatusBadge({ order }: { order: any }) {
  const activeItems = order.order_items.filter((i: any) => !i.cancelado)
  const hasSentItems = activeItems.some((i: any) => i.enviado_a_cocina)
  if (!hasSentItems) return null

  const pendingItems = activeItems.filter((i: any) => !i.listo)
  if (pendingItems.length === 0 && activeItems.length > 0) {
    return (
      <span className="text-xs font-bold text-white bg-green-500 px-2 py-1 rounded animate-pulse">
        🍽️ LISTO PARA ENTREGAR
      </span>
    )
  }

  return (
    <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded">
      🔥 EN COCINA
    </span>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function MeseroView({
  products, extras, ingredients, tables, initialActiveOrders, employeeId, employeeName, categoriesList, settings
}: MeseroViewProps) {
  const [activeView, setActiveView] = useState<'new_order' | 'active_orders' | 'historial'>('active_orders')
  const [targetOrderIdForAppend, setTargetOrderIdForAppend] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Cart state persisted across tabs
  const cartState = useCartState('mesero_cart_state')

  // Keep screen awake while the waiter is active
  useWakeLock()

  // ── Cancel modal ──────────────────────────────────────────────────────────
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [itemToCancel, setItemToCancel] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0])

  // ── Confirm modal ─────────────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false, title: '', message: '', variant: 'danger' as 'primary' | 'danger',
    onConfirm: () => { },
  })
  const openConfirm = (title: string, message: string, onConfirm: () => void, variant: 'primary' | 'danger' = 'danger') =>
    setConfirmModal({ isOpen: true, title, message, variant, onConfirm })
  const closeConfirm = () => setConfirmModal(p => ({ ...p, isOpen: false }))

  // ── Realtime ──────────────────────────────────────────────────────────────
  const supabase = useRef(createClient()).current
  const [liveOrders, setLiveOrders] = useState<Order[]>(initialActiveOrders)
  const [historialHoy, setHistorialHoy] = useState<Order[]>([])
  const { toasts, pushToast } = useToasts()
  const previousReadyState = useRef<Map<string, boolean>>(new Map())
  const isFirstLoad = useRef(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (signature: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(signature)) next.delete(signature)
      else next.add(signature)
      return next
    })
  }

  const fetchActiveOrders = useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [activeRes, historialRes] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*, product:products(*), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional), creador:employees!order_items_creado_por_fkey(nombre, rol))')
        .eq('estado', 'abierto')
        .order('creado_en', { ascending: false }),
      supabase
        .from('orders')
        .select('*, order_items(*, product:products(*), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional), creador:employees!order_items_creado_por_fkey(nombre, rol))')
        .eq('estado', 'cerrado')
        .gte('creado_en', today.toISOString())
        .order('creado_en', { ascending: false }),
    ])

    if (activeRes.data) {
      // Defensive filter: only keep orders that have at least one active (non-canceled) item
      const validActiveOrders = activeRes.data.filter(order =>
        order.order_items.some((item: any) => !item.cancelado)
      )

      if (!isFirstLoad.current) {
        validActiveOrders.forEach(order => {
          const label =
            order.tipo === 'mesa'
              ? `Mesa ${tables.find((t: any) => t.id === order.table_id)?.numero ?? ''}`
              : `${formatOrderType(order.tipo)}${order.nombre_cliente ? ` - ${order.nombre_cliente}` : ''}`

          order.order_items.forEach((item: any) => {
            if (item.cancelado) return
            const wasReady = previousReadyState.current.get(item.id)
            if (wasReady === false && item.listo === true) {
              pushToast(`${item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'} listo (${label})`, 'info')
              playItemListo()
            }
            previousReadyState.current.set(item.id, item.listo)
          })

          const activeItems = order.order_items.filter((i: any) => !i.cancelado)
          const allReady = activeItems.length > 0 && activeItems.every((i: any) => i.listo)
          const orderWasReady = previousReadyState.current.get(`order_${order.id}`)
          if (orderWasReady === false && allReady) {
            pushToast(`¡Pedido listo para entregar! ${label}`, 'success')
            playPedidoListo()
          }
          previousReadyState.current.set(`order_${order.id}`, allReady)
        })
      } else {
        activeRes.data.forEach(order => {
          order.order_items.forEach((item: any) =>
            previousReadyState.current.set(item.id, item.listo)
          )
          const activeItems = order.order_items.filter((i: any) => !i.cancelado)
          const allReady = activeItems.length > 0 && activeItems.every((i: any) => i.listo)
          previousReadyState.current.set(`order_${order.id}`, allReady)
        })
        isFirstLoad.current = false
      }
      setLiveOrders(validActiveOrders)
    }

    if (historialRes.data) {
      setHistorialHoy(historialRes.data)
    }
  }, [supabase, tables, pushToast])

  const debouncedFetchActiveOrders = useDebouncedCallback(fetchActiveOrders, 250)

  useEffect(() => {
    document.addEventListener('click', unlockAudio, { once: true })
    fetchActiveOrders()

    const channel = supabase
      .channel('mesero-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetchActiveOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedFetchActiveOrders)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [debouncedFetchActiveOrders, fetchActiveOrders, supabase])



  const requestCancel = (itemId: string, enviadoACocina: boolean) => {
    if (!enviadoACocina) {
      openConfirm('Borrar Producto', '¿Estás seguro de que quieres borrar este producto?', () => {
        closeConfirm()
        deleteOrderItemUnsent(itemId)
      })
    } else {
      setItemToCancel(itemId)
      setCancelModalOpen(true)
    }
  }

  const confirmCancel = async () => {
    if (!itemToCancel) return
    setIsSubmitting(true)
    const res = await cancelOrderItem(itemToCancel, cancelReason, employeeId)
    setIsSubmitting(false)
    if (!res?.error) {
      setCancelModalOpen(false)
      setItemToCancel(null)
    } else alert('Error: ' + res.error)
  }



  return (
    <>
      <ToastContainer toasts={toasts} />

      <div className="flex flex-col min-h-0 h-auto md:h-[calc(100dvh_-_76px)] pb-24 md:pb-0">

        {/* ── Panel izquierdo ───────────────────────────────────────── */}
        <div className="flex-1 w-full min-h-0 bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20 overflow-hidden flex flex-col min-h-[60dvh] md:min-h-0">
          {/* Tabs */}
          <div className="flex border-b border-[var(--color-gris)]/20 sticky top-0 z-20 bg-white">
            {([
              { key: 'new_order', label: 'Nuevo Pedido' },
              { key: 'active_orders', label: `Activos (${liveOrders.length})` },
              { key: 'historial', label: `Historial (${historialHoy.length})` },
            ] as const).map(tab => (
              <button
                key={tab.key}
                className={`flex-1 py-4 font-bold tracking-wider uppercase text-xs transition-colors ${activeView === tab.key
                  ? 'bg-[var(--color-bronce)] text-white'
                  : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
                  }`}
                onClick={() => { setActiveView(tab.key); setTargetOrderIdForAppend(null) }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Nuevo Pedido ─────────────────────────────────────── */}
          {activeView === 'new_order' && (
            <div className="flex-1 overflow-hidden relative min-h-0">
              <POSMenu
                products={products}
                extras={extras}
                ingredients={ingredients}
                tables={tables}
                liveOrders={liveOrders}
                employeeId={employeeId}
                targetOrderId={targetOrderIdForAppend}
                categoriesList={categoriesList}
                {...cartState}
                onOrderCreated={() => {
                  cartState.clearCart()
                  setActiveView('active_orders')
                  setTargetOrderIdForAppend(null)
                  fetchActiveOrders()
                }}
              />
            </div>
          )}

          {/* ── Pedidos Activos ──────────────────────────────────── */}
          {activeView === 'active_orders' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50/50 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 content-start">
              {liveOrders.length === 0 && (
                <p className="text-center text-[var(--color-gris)] py-10">No hay pedidos abiertos.</p>
              )}
              {liveOrders.map(order => {
                const tableLabel = order.tipo === 'mesa'
                  ? `Mesa ${tables.find((t: any) => t.id === order.table_id)?.numero ?? ''}`
                  : `${formatOrderType(order.tipo)}${order.nombre_cliente ? ` - ${order.nombre_cliente}` : ''}`
                const activeItems = order.order_items.filter((i: any) => !i.cancelado)
                const readyCount = activeItems.filter((i: any) => i.listo).length
                const allReady = activeItems.length > 0 && readyCount === activeItems.length

                return (
                  <div
                    key={order.id}
                    className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${allReady ? 'border-green-400 shadow-green-100' : 'border-[var(--color-gris)]/20'
                      }`}
                  >
                    <div className="flex justify-between items-center mb-4 border-b border-[var(--color-gris)]/10 pb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold uppercase tracking-widest text-base bg-[var(--color-crema)] px-2 py-1 rounded ${order.tipo !== 'mesa' ? getOrderTypeColorClass(order.tipo) : 'text-[var(--color-bronce)]'}`}>
                          {tableLabel} {order.nombre_cliente ? `(${order.nombre_cliente})` : ''}
                        </span>
                        {activeItems.some((i: any) => i.enviado_a_cocina) && (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded ${allReady
                            ? 'bg-green-100 text-green-700'
                            : 'bg-orange-50 text-orange-700'
                            }`}>
                            {allReady ? '🍽️ LISTO PARA ENTREGAR' : `🔥 ${readyCount}/${activeItems.length} listos`}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          setTargetOrderIdForAppend(order.id)
                          setActiveView('new_order')
                        }}>
                          Agregar Más
                        </Button>
                        {order.order_items.some((i: any) => !i.cancelado && !i.enviado_a_cocina) && (
                          <Button
                            size="sm"
                            disabled={isSubmitting}
                            onClick={async () => {
                              setIsSubmitting(true)
                              
                              // Imprimir ticket de cocina
                              if (settings?.impresora_cocina_activa) {
                                const pendingItems = order.order_items.filter((i: any) => !i.cancelado && !i.enviado_a_cocina)
                                if (pendingItems.length > 0) {
                                  const groupedPending = groupOrderItems(pendingItems)
                                  const itemsToPrint = groupedPending.map(group => {
                                    const item = group.representante
                                    return {
                                      nombre: item.nombre_producto ?? item.product?.nombre ?? 'Producto',
                                      cantidad: group.cantidad_total,
                                      precio_unitario: 0,
                                      variante_nombre: item.nombre_variante || item.variante?.nombre,
                                      extras_pago: item.order_item_extras?.map((ep: any) => ({ nombre: ep.nombre_extra, precio: 0 })) || [],
                                      extra_nombre: item.extra?.nombre,
                                      extra_precio: 0,
                                      ingredientes_seleccionados: item.ingredientes_seleccionados,
                                      notas: item.notas,
                                    }
                                  })
                                  const printData: PrintOrderData = {
                                    orderId: order.id,
                                    items: itemsToPrint,
                                    total: 0,
                                    metodoPago: 'N/A',
                                    fecha: new Date().toLocaleString(),
                                    tipoPedido: order.tipo === 'mesa' ? `Mesa ${order.tables?.numero}` : order.tipo,
                                    atendidoPor: employeeName,
                                    mesa: order.tipo === 'mesa' ? `${order.tables?.numero}` : undefined,
                                  }
                                  try {
                                    await imprimirTicketCocina(printData, settings)
                                  } catch (e) {
                                    console.error('Error imprimiendo en cocina:', e)
                                  }
                                }
                              }

                              const result = await sendToKitchen(order.id, crypto.randomUUID())
                              setIsSubmitting(false)
                              if (result?.error) {
                                pushToast(result.error, 'info')
                              } else {
                                pushToast('¡Orden enviada a cocina! 🍳', 'success')
                                fetchActiveOrders()
                              }
                            }}
                          >
                            {isSubmitting ? 'Enviando...' : 'Enviar a Cocina'}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {order.order_items.map((item: any) => (
                        <div key={item.id} className={`flex justify-between items-start ${item.cancelado ? 'opacity-40 line-through' : ''}`}>
                          <div className="flex items-start gap-2">
                            <span className="font-bold w-6">{item.cantidad}x</span>
                            <div className="flex flex-col">
                              <span className={`font-semibold text-sm ${item.cancelado ? 'line-through text-[var(--color-gris)]' : ''}`}>
                                {item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'}
                              </span>
                              {(item.nombre_variante || item.variante?.nombre) && (
                                <div className="text-[10px] font-bold text-purple-600 mt-0.5">
                                  ◆ {item.nombre_variante || item.variante?.nombre}
                                </div>
                              )}
                              {item.order_item_extras?.length > 0 && (
                                <div className="space-y-0 mt-0.5">
                                  {item.order_item_extras.map((ep: any, i: number) => (
                                    <div key={i} className="text-xs font-semibold text-[var(--color-bronce)]">
                                      + {ep.nombre_extra} <span className="font-bold">+${ep.precio_adicional}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {item.ingredientes_seleccionados?.length > 0 && (
                                <span className="text-xs text-[var(--color-gris)] italic">
                                  Con: {item.ingredientes_seleccionados.join(', ')}
                                  {item.cargo_ingredientes_extra > 0 && ` (+$${item.cargo_ingredientes_extra})`}
                                </span>
                              )}
                              {item.extra_id && (
                                <span className="text-sm font-semibold text-[var(--color-bronce)]">
                                  + {item.extra?.nombre || extras.find(e => e.id === item.extra_id)?.nombre}
                                </span>
                              )}
                              {item.cancelado && <span className="text-xs text-red-500 font-bold">({item.motivo_cancelacion})</span>}
                              {!item.cancelado && item.creador && (
                                <span className="text-[10px] text-gray-400 mt-0.5">
                                  Agregado por: {item.creador.nombre}
                                </span>
                              )}
                            </div>
                            {item.enviado_a_cocina && !item.listo && !item.cancelado && (
                              <span className="text-[10px] text-orange-600 bg-orange-50 px-1 rounded font-bold ml-1 mt-0.5">🔥 En cocina</span>
                            )}
                            {item.listo && !item.cancelado && (
                              <span className="text-[10px] text-green-600 bg-green-50 px-1 rounded font-bold ml-1 mt-0.5">Listo</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-base">
                              ${((item.precio_unitario + (item.extra_precio || 0) + (item.order_item_extras?.reduce((sum: number, ep: any) => sum + (ep.precio_adicional || 0), 0) || 0) + (item.cargo_ingredientes_extra || 0)) * item.cantidad).toFixed(2)}
                            </span>
                            {!item.cancelado && !item.pagado && (
                              <button
                                onClick={() => requestCancel(item.id, item.enviado_a_cocina)}
                                className="text-red-500 text-xs font-bold hover:underline"
                              >
                                {item.enviado_a_cocina ? 'Cancelar' : 'Borrar'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--color-gris)]/10 flex items-center justify-between gap-3 flex-wrap">
                      <span className="font-bold text-lg">Total: ${calcTotal(order.order_items).toFixed(2)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Historial de Hoy ─────────────────────────────────── */}
          {activeView === 'historial' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
              {historialHoy.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="text-5xl mb-3">📋</div>
                  <p className="text-[var(--color-gris)] font-semibold text-sm">Sin cierres aún hoy.</p>
                  <p className="text-xs text-[var(--color-gris)] mt-1">Las mesas cobradas aparecerán aquí.</p>
                </div>
              )}
              {historialHoy.map(order => {
                const tableLabel = order.tipo === 'mesa'
                  ? `Mesa ${order.tables?.numero ?? tables.find((t: any) => t.id === order.table_id)?.numero ?? ''}`
                  : `${formatOrderType(order.tipo)}${order.nombre_cliente ? ` - ${order.nombre_cliente}` : ''}`
                const closedAt = new Date(order.creado_en)
                const total = calcTotal(order.order_items)
                const activeItems = order.order_items.filter((i: any) => !i.cancelado)

                return (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className={`font-bold uppercase tracking-wider text-sm ${order.tipo !== 'mesa' ? getOrderTypeColorClass(order.tipo) : 'text-[var(--color-bronce)]'}`}>{tableLabel}</span>
                        <div className="text-xs text-[var(--color-gris)] mt-0.5">
                          {closedAt.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {closedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-green-600">${total.toFixed(2)}</div>
                        <div className="text-xs text-[var(--color-gris)]">{activeItems.length} producto{activeItems.length !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      {activeItems.map((item: any) => (
                        <div key={item.id} className="flex flex-col bg-[var(--color-crema)] px-2 py-1 rounded">
                          <span className="text-sm text-[var(--color-negro)] font-semibold">
                            {item.cantidad}x {item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {item.creador
                              ? `Agregado por: ${item.creador.nombre} (${item.creador.rol})`
                              : 'Sin registro'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancelar Producto">
        <p className="mb-4 text-sm text-[var(--color-gris)]">Este pedido ya fue enviado a cocina. Registra el motivo.</p>
        <div className="space-y-3 mb-6">
          {CANCEL_REASONS.map(reason => (
            <label key={reason} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input type="radio" name="cancelReason" value={reason} checked={cancelReason === reason} onChange={() => setCancelReason(reason)} className="w-5 h-5 text-[var(--color-bronce)]" />
              <span className="font-semibold">{reason}</span>
            </label>
          ))}
        </div>
        <Button className="w-full safe-bottom" variant="danger" onClick={confirmCancel} disabled={isSubmitting}>
          {isSubmitting ? 'Cancelando...' : 'Confirmar Cancelación'}
        </Button>
      </Modal>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
      />
    </>
  )
}
