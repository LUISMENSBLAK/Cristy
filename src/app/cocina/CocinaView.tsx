'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { groupOrderItems, GroupedOrderItem } from '@/lib/orderUtils'
import { createClient } from '@/utils/supabase/client'
import { formatOrderType, getOrderTypeColorClass } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { playNuevoPedido, playItemListo, playPedidoListo, unlockAudio } from '@/utils/sound'
import { ToastContainer, useToasts } from '@/components/ui/Toast'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'

export default function CocinaView({ initialOrders }: { initialOrders: any[] }) {
  const supabase = useRef(createClient()).current

  const [orders, setOrders] = useState(initialOrders)
  const { toasts, pushToast } = useToasts()
  const knownOrderIds = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)
  // Track which order cards have "Ver Completados" expanded
  const [expandedCompleted, setExpandedCompleted] = useState<Set<string>>(new Set())
  // Track which groups are being pressed (for the visual transition before optimistic update)
  const [pressingGroups, setPressingGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Desbloquear audio en cada clic para asegurar que el navegador no suspenda el contexto
    document.addEventListener('click', unlockAudio)
    return () => document.removeEventListener('click', unlockAudio)
  }, [])

  const fetchOrders = useCallback(async () => {
    // Fetch all open orders that have at least one item sent to kitchen
    const { data } = await supabase
      .from('orders')
      .select('*, tables(numero), order_items(*, product:products(nombre), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional), creador:employees!order_items_creado_por_fkey(nombre, rol))')
      .eq('estado', 'abierto')
      .order('creado_en', { ascending: true })

    if (data) {
      // Filter to orders that have at least one item enviado_a_cocina = true
      const relevantOrders = data.filter(o =>
        o.order_items.some((i: any) => i.enviado_a_cocina && !i.cancelado)
      )

      if (!isFirstLoad.current) {
        const newOnes = relevantOrders.filter(o => !knownOrderIds.current.has(o.id))
        newOnes.forEach(o => {
          const label = o.tipo === 'mesa' ? `Mesa ${o.tables?.numero}` : (o.nombre_cliente ? `${formatOrderType(o.tipo)} (${o.nombre_cliente})` : formatOrderType(o.tipo))
          pushToast(`Nuevo pedido: ${label}`, 'info')
          playNuevoPedido()
        })
      }
      knownOrderIds.current = new Set(relevantOrders.map(o => o.id))
      isFirstLoad.current = false
      setOrders(relevantOrders)
    }
  }, [supabase, pushToast])

  const debouncedFetchOrders = useDebouncedCallback(fetchOrders, 250)

  useEffect(() => {
    fetchOrders()

    const channel = supabase
      .channel('cocina-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedFetchOrders)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [debouncedFetchOrders, fetchOrders, supabase])

  const handleItemListoStatusChange = async (itemIds: string[], orderId: string, status: boolean, groupSignature?: string) => {
    // 1. Calcular el nuevo estado
    const updatedOrders = orders.map(order => ({
      ...order,
      order_items: order.order_items.map((i: any) =>
        itemIds.includes(i.id) ? { ...i, listo: status } : i
      )
    }))

    // La lógica de audio ahora se ejecuta de manera 100% síncrona directamente en el onClick
    // para evitar que Safari bloquee el sonido al entrar en una función async.
    
    // 2. Iniciar transición CSS si aplica
    if (groupSignature && status) {
      setPressingGroups(prev => new Set(prev).add(groupSignature))
      await new Promise(resolve => setTimeout(resolve, 150))
      setPressingGroups(prev => {
        const next = new Set(prev)
        next.delete(groupSignature)
        return next
      })
    }

    // 4. Aplicar el estado optimista (ahora sí se mueve el elemento)
    setOrders(updatedOrders)

    // 5. Llamada a base de datos
    try {
      if (itemIds.length === 1) {
        const { error } = await supabase.rpc('marcar_item_listo', { p_item_id: itemIds[0], p_listo: status })
        if (error) throw error
      } else {
        await Promise.all(itemIds.map(id => supabase.rpc('marcar_item_listo', { p_item_id: id, p_listo: status })))
      }
    } catch (error) {
      setOrders(orders)
      pushToast('Error al actualizar, intenta de nuevo', 'info')
    }
  }

  const markOrderListo = async (order: any) => {
    const itemIds = order.order_items
      .filter((i: any) => i.enviado_a_cocina && !i.cancelado && !i.listo)
      .map((i: any) => i.id)
    if (itemIds.length === 0) return

    setOrders(prev => prev.map(o =>
      o.id === order.id
        ? {
            ...o,
            order_items: o.order_items.map((i: any) =>
              i.enviado_a_cocina && !i.cancelado ? { ...i, listo: true } : i
            )
          }
        : o
    ))

    const label = order.tipo === 'mesa'
      ? `Mesa ${order.tables?.numero}`
      : (order.nombre_cliente ? `${formatOrderType(order.tipo)} (${order.nombre_cliente})` : formatOrderType(order.tipo))
    pushToast(`¡Pedido completo listo! ${label}`, 'success')

    try {
      await Promise.all(itemIds.map((id: string) => 
        supabase.rpc('marcar_item_listo', { p_item_id: id, p_listo: true })
      ))
    } catch (e) {
      setOrders(orders)
    }
  }

  const toggleExpandedCompleted = (orderId: string) => {
    setExpandedCompleted(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  // Only show orders with at least one pending (sent but not listo, not cancelled) item
  const pendingOrders = orders.filter(order =>
    order.order_items.some((i: any) => i.enviado_a_cocina && !i.cancelado && !i.listo)
  )

  return (
    <>
      <ToastContainer toasts={toasts} />

      {pendingOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">✅</div>
          <p className="text-2xl font-bold text-green-600 font-serif">¡Todo al corriente!</p>
          <p className="text-[var(--color-gris)] mt-2">No hay pedidos pendientes en cocina.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {pendingOrders.map(order => {
          const sentItems = order.order_items.filter((i: any) => i.enviado_a_cocina && !i.cancelado)
          const rawPendingItems = sentItems.filter((i: any) => !i.listo)
          const rawCompletedItems = sentItems.filter((i: any) => i.listo)
          const rawCancelledItems = order.order_items.filter((i: any) => i.cancelado && i.enviado_a_cocina)
          
          const groupedPending = groupOrderItems(rawPendingItems)
          const groupedCompleted = groupOrderItems(rawCompletedItems)
          const groupedCancelled = groupOrderItems(rawCancelledItems)

          const totalCount = sentItems.length
          const listoCount = rawCompletedItems.length
          const isCompletedExpanded = expandedCompleted.has(order.id)

          return (
            <div
              key={order.id}
              className="bg-white rounded-xl shadow-md border-t-4 border-[var(--color-bronce)] p-4 flex flex-col"
            >
              <div className="flex justify-between items-start mb-3 pb-2 border-b border-[var(--color-gris)]/10">
                <div>
                  <div className={`font-bold text-lg leading-none ${getOrderTypeColorClass(order.tipo)}`}>
                    {order.tipo === 'mesa' ? `Mesa ${order.tables?.numero}` : (order.nombre_cliente ? `${formatOrderType(order.tipo)} (${order.nombre_cliente})` : formatOrderType(order.tipo))}
                  </div>
                  <div className="text-xs text-[var(--color-gris)] mt-1">
                    #{order.id.substring(0, 6).toUpperCase()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-xs font-bold text-[var(--color-gris)]">
                    {new Date(order.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-[var(--color-bronce)]">
                    <span>{listoCount}/{totalCount}</span>
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-300"
                        style={{ width: `${totalCount > 0 ? (listoCount / totalCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                {groupedCancelled.map((group: GroupedOrderItem) => {
                  const item = group.representante
                  return (
                    <div key={group.signature} className="flex gap-2 items-start opacity-40">
                      <span className="font-bold w-6 text-sm">{group.cantidad_total}x</span>
                      <div className="flex-1 flex flex-col min-w-0">
                        <span className="text-sm line-through text-red-400">{item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'}</span>
                        {item.notas && (
                          <span className="text-xs font-bold text-red-500 bg-red-50 px-1 py-0.5 rounded mt-0.5 max-w-fit">
                            Nota: {item.notas}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-red-500 font-bold uppercase mt-1">Cancelado</span>
                    </div>
                  )
                })}

                {groupedPending.map((group: GroupedOrderItem) => {
                  const item = group.representante
                  return (
                    <div key={group.signature} className="flex gap-2 items-center">
                      <span className="font-bold w-6 text-lg">{group.cantidad_total}x</span>
                      <div className="flex-1 flex flex-col min-w-0">
                        <span className="font-semibold">{item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'}</span>
                        {(item.nombre_variante || item.variante?.nombre) && (
                          <div className="text-xs font-bold text-purple-600">◆ {item.nombre_variante || item.variante?.nombre}</div>
                        )}
                        {item.order_item_extras?.length > 0 && (
                          <div className="space-y-0 mt-0.5">
                            {item.order_item_extras.map((ep: any, i: number) => (
                              <div key={i} className="text-[15px] font-bold text-[var(--color-bronce)]">
                                + {ep.nombre_extra}
                              </div>
                            ))}
                          </div>
                        )}
                        {item.ingredientes_seleccionados?.length > 0 && (
                          <span className="text-xs text-[var(--color-gris)] italic">
                            Con: {item.ingredientes_seleccionados.join(', ')}
                          </span>
                        )}
                        {item.extra_id && (
                          <span className="text-[15px] font-bold text-[var(--color-bronce)]">
                            + {item.extra?.nombre}
                          </span>
                        )}
                        {item.notas && (
                          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1 py-0.5 rounded mt-0.5 max-w-fit border border-blue-200">
                            Nota: {item.notas}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          // Determinar si este grupo completará todo el pedido
                          const pendingInOrder = sentItems.filter((i: any) => !i.listo).length
                          const isLastPendingGroup = pendingInOrder === group.ids.length
                          
                          // Disparar audio de forma 100% síncrona para que Safari lo permita
                          if (isLastPendingGroup) {
                            playPedidoListo()
                            const label = order.tipo === 'mesa' ? `Mesa ${order.tables?.numero}` : (order.nombre_cliente ? `${formatOrderType(order.tipo)} (${order.nombre_cliente})` : formatOrderType(order.tipo))
                            pushToast(`¡Todo listo! ${label}`, 'success')
                          } else {
                            playItemListo()
                          }
                          
                          handleItemListoStatusChange(group.ids, order.id, true, group.signature)
                        }}
                        className={`
                          w-10 h-10 rounded-xl border-2 flex-shrink-0 flex items-center justify-center
                          transition-all duration-150 active:scale-90
                          ${pressingGroups.has(group.signature)
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'bg-white border-[var(--color-gris)]/30 text-transparent hover:border-[var(--color-bronce)] hover:bg-[var(--color-crema)]'
                          }
                        `}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {rawCompletedItems.length > 0 && (
                <div className="mt-3 pt-2 border-t border-dashed border-[var(--color-gris)]/20">
                  <button
                    onClick={() => toggleExpandedCompleted(order.id)}
                    className="flex items-center gap-1.5 text-xs text-[var(--color-gris)] hover:text-[var(--color-bronce)] transition-colors w-full"
                  >
                    {isCompletedExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    <span className="font-semibold">
                      Ver completados ({rawCompletedItems.length})
                    </span>
                  </button>

                  {isCompletedExpanded && (
                    <div className="mt-3 space-y-2">
                      {groupedCompleted.map((group: GroupedOrderItem) => {
                        const item = group.representante
                        return (
                          <div key={group.signature} className="flex gap-2 items-center opacity-70">
                            <span className="font-bold w-6 text-sm">{group.cantidad_total}x</span>
                            <div className="flex-1 flex flex-col min-w-0">
                              <span className="text-sm line-through text-green-700">{item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'}</span>
                              {item.notas && (
                                <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1 py-0.5 rounded mt-0.5 max-w-fit">
                                  Nota: {item.notas}
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[var(--color-gris)] hover:bg-gray-100 shrink-0 h-8 p-1 text-xs"
                              onClick={() => handleItemListoStatusChange(group.ids, order.id, false)}
                            >
                              Deshacer
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Mark all pending as done button */}
              <div className="mt-4 pt-3 border-t border-[var(--color-gris)]/10">
                <Button
                  className="w-full h-12"
                  onClick={() => {
                    playPedidoListo()
                    markOrderListo(order)
                  }}
                >
                  ✓ Todo Listo ({rawPendingItems.length} pendiente{rawPendingItems.length !== 1 ? 's' : ''})
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
