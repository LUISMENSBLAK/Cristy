'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { playPedidoListo, playItemListo, unlockAudio } from '@/utils/sound'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { processPayment, addExpense, updatePaymentMethod } from './actions'
import { sendToKitchen, cancelOrderItem, deleteOrderItemUnsent } from '@/app/actions/orders'
import { imprimirTicket, imprimirTicketCocina, PrintOrderData } from '@/utils/printTicket'
import { POSMenu } from '@/components/POSMenu'
import { useCartState } from '@/hooks/useCartState'
import { ToastContainer, useToasts } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { formatOrderType, getOrderTypeColorClass } from '@/lib/utils'
import { groupOrderItems, GroupedOrderItem, calcTotal } from '@/lib/orderUtils'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { ChevronDown, ChevronUp, Lock, Unlock } from 'lucide-react'
import {
  enqueuePendingPayment,
  getPendingPayments,
  getBlockedItemIds,
  syncPendingPayments,
  type PendingPayment,
} from '@/lib/offlineQueue'

interface CajaViewProps {
  initialOrders: any[]
  products: any[]
  extras: any[]
  ingredients: any[]
  tables: any[]
  employeeId: string
  employeeName: string
  employeeRol: string
  categoriesList?: { id: string; nombre: string; orden: number }[]
}

export default function CajaView({ initialOrders, products, extras, ingredients, tables, employeeId, employeeName, employeeRol, categoriesList }: CajaViewProps) {
  const [activeTab, setActiveTab] = useState<'cobro' | 'tomar_pedido' | 'egresos' | 'corte'>('cobro')
  const [tomarPedidoSubTab, setTomarPedidoSubTab] = useState<'nuevo' | 'activos' | 'historial'>('nuevo')
  const [targetOrderIdForAppend, setTargetOrderIdForAppend] = useState<string | null>(null)

  // Cart state persisted across tabs
  const cartState = useCartState('caja_cart_state')

  // Keep screen awake while the cashier is active
  useWakeLock()

  // ── Realtime state ────────────────────────────────────────────────────────
  const supabase = useRef(createClient()).current
  const [liveOrders, setLiveOrders] = useState(initialOrders)
  const [historialHoy, setHistorialHoy] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const previousReadyState = useRef<Map<string, boolean>>(new Map())
  const isFirstLoad = useRef(true)
  const fetchSeq = useRef(0)
  // ── Declared early so fetchOrders can call pushToast ─────────────────────
  const { toasts, pushToast } = useToasts()

  const fetchOrders = useCallback(async () => {
    const mySeq = ++fetchSeq.current
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const [ordersData, historialRes, settingsData] = await Promise.all([
      supabase
        .from('orders')
        .select('*, tables(numero), order_items(*, product:products(nombre), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional), creador:employees!order_items_creado_por_fkey(nombre, rol))')
        .eq('estado', 'abierto')
        .order('creado_en', { ascending: true }),
      supabase
        .from('orders')
        .select('*, tables(numero), order_items(*, product:products(nombre), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional), creador:employees!order_items_creado_por_fkey(nombre, rol)), payments(id, metodo, monto_cobrado, anulado, creado_en)')
        .eq('estado', 'cerrado')
        .gte('creado_en', today.toISOString())
        .order('creado_en', { ascending: false }),
      supabase.from('settings').select('*').eq('id', 1).single()
    ])

    if (ordersData.error) {
      console.error('[CajaView] fetchOrders error:', JSON.stringify(ordersData.error))
    }

    if (mySeq !== fetchSeq.current) return

    if (ordersData.data) {
      const validOrders = ordersData.data.filter(order =>
        order.order_items.some((item: any) => !item.cancelado)
      )

      if (!isFirstLoad.current) {
        validOrders.forEach(order => {
          const tableLabel = order.tipo === 'mesa'
            ? `Mesa ${order.tables?.numero ?? ''}`
            : formatOrderType(order.tipo)

          order.order_items.forEach((item: any) => {
            if (item.cancelado) return
            const wasReady = previousReadyState.current.get(item.id)
            if (wasReady === false && item.listo === true) {
              pushToast(`${item.nombre_producto ?? item.product?.nombre ?? 'Producto'} listo (${tableLabel})`, 'info')
              playItemListo()
            }
            previousReadyState.current.set(item.id, item.listo)
          })

          const activeItems = order.order_items.filter((i: any) => !i.cancelado)
          const allReady = activeItems.length > 0 && activeItems.every((i: any) => i.listo)
          const orderWasReady = previousReadyState.current.get(`order_${order.id}`)
          if (orderWasReady === false && allReady) {
            pushToast(`¡Pedido listo para entregar! ${tableLabel}`, 'success')
            playPedidoListo()
          }
          previousReadyState.current.set(`order_${order.id}`, allReady)
        })
      } else {
        ordersData.data.forEach(order => {
          order.order_items.forEach((item: any) =>
            previousReadyState.current.set(item.id, item.listo)
          )
          const activeItems = order.order_items.filter((i: any) => !i.cancelado)
          const allReady = activeItems.length > 0 && activeItems.every((i: any) => i.listo)
          previousReadyState.current.set(`order_${order.id}`, allReady)
        })
        isFirstLoad.current = false
      }

      setLiveOrders(validOrders)
    }
    if (historialRes.data) {
      setHistorialHoy(historialRes.data)
    }
    
    if (settingsData.data) { setSettings(settingsData.data) }
  }, [supabase, pushToast])

  const debouncedFetchOrders = useDebouncedCallback(fetchOrders, 250)

  useEffect(() => {
    document.addEventListener('click', unlockAudio, { once: true })
    fetchOrders()

    const channel = supabase
      .channel('caja-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedFetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, debouncedFetchOrders)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [debouncedFetchOrders, fetchOrders, supabase])

  // ── Checkout state ────────────────────────────────────────────────────────
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [expandedCheckoutGroups, setExpandedCheckoutGroups] = useState<Set<string>>(new Set())
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta'>('efectivo')
  const [montoRecibidoStr, setMontoRecibidoStr] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastTicket, setLastTicket] = useState<PrintOrderData | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const printInFlightRef = useRef(false)

  // ── Kitchen/cancel state ──────────────────────────────────────────────────
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [itemToCancel, setItemToCancel] = useState<string | null>(null)
  const [cancelIsUnsent, setCancelIsUnsent] = useState(false)
  const [cancelReason, setCancelReason] = useState('Cliente cambió de opinión')

  const CANCEL_REASONS = [
    'Cliente cambió de opinión',
    'No había el producto',
    'Error al agregar',
    'Otro',
  ]

  // ── Offline queue state ────────────────────────────────────────────────────
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([])
  const [blockedItemIds, setBlockedItemIds] = useState<string[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  // Load pending queue on mount and refresh after operations
  const refreshQueue = useCallback(async () => {
    const [pending, blocked] = await Promise.all([
      getPendingPayments(),
      getBlockedItemIds(),
    ])
    setPendingPayments(pending)
    setBlockedItemIds(blocked)
  }, [])

  useEffect(() => {
    refreshQueue()

    // Auto-sync when coming back online
    const handleOnline = async () => {
      setIsSyncing(true)
      const results = await syncPendingPayments(processPayment)
      setIsSyncing(false)
      await refreshQueue()

      const successes = results.filter(r => r.type === 'success').length
      const failures = results.filter(r => r.type === 'failed')

      if (successes > 0) {
        pushToast(`✅ ${successes} pago(s) sincronizado(s) al recuperar conexión`, 'success')
        fetchOrders()
      }
      if (failures.length > 0) {
        pushToast(`⚠️ ${failures.length} pago(s) con error — revisar con el administrador`, 'info')
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [refreshQueue, fetchOrders, pushToast])

  // ── Expense state ─────────────────────────────────────────────────────────
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseMethod, setExpenseMethod] = useState<'efectivo' | 'tarjeta'>('efectivo')
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)

  // ── Corte de caja state ───────────────────────────────────────────────────
  const [corteEfectivoSistema, setCorteEfectivoSistema] = useState<number | null>(null)
  const [corteTarjetaSistema, setCorteTarjetaSistema] = useState<number | null>(null)
  const [corteEgresosEfectivo, setCorteEgresosEfectivo] = useState<number>(0)
  const [corteInicioFecha, setCorteInicioFecha] = useState<string | null>(null)
  const [corteEfectivoContado, setCorteEfectivoContado] = useState('')
  const [corteNotas, setCorteNotas] = useState('')
  const [corteSaving, setCorteSaving] = useState(false)
  const [corteCalculado, setCorteCalculado] = useState(false)

  const calcularCorte = async () => {
    // Find the last corte for this employee (or today's start)
    const { data: ultimoCorte } = await supabase
      .from('cortes_caja')
      .select('fecha_fin')
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle()

    const desde = ultimoCorte?.fecha_fin ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    setCorteInicioFecha(desde)

    const { data: pagos, error } = await supabase
      .from('payments')
      .select('monto_cobrado, metodo')
      .gte('creado_en', desde)
      .eq('anulado', false)

    if (error) {
      alert('Error calculando el corte: ' + error.message)
      return
    }

    const efectivo = (pagos || []).filter((p: any) => p.metodo === 'efectivo').reduce((s: number, p: any) => s + Number(p.monto_cobrado), 0)
    const tarjeta = (pagos || []).filter((p: any) => p.metodo === 'tarjeta').reduce((s: number, p: any) => s + Number(p.monto_cobrado), 0)

    const { data: egresosEfectivoData, error: errorEgresos } = await supabase.rpc('obtener_egresos_efectivo', { p_desde: desde })

    if (errorEgresos) {
      alert('Error calculando egresos del corte: ' + errorEgresos.message)
      return
    }

    const egresosEfectivo = Number(egresosEfectivoData) || 0
    setCorteEgresosEfectivo(egresosEfectivo)
    setCorteEfectivoSistema(efectivo - egresosEfectivo)
    setCorteTarjetaSistema(tarjeta)
    setCorteCalculado(true)
  }

  const guardarCorte = async () => {
    if (!corteCalculado || corteEfectivoSistema === null || !corteInicioFecha) return
    const contado = parseFloat(corteEfectivoContado)
    if (isNaN(contado)) return alert('Ingresa el efectivo contado en caja')
    setCorteSaving(true)
    const { error } = await supabase.from('cortes_caja').insert({
      empleado_id: employeeId,
      fecha_inicio: corteInicioFecha,
      fecha_fin: new Date().toISOString(),
      efectivo_sistema: corteEfectivoSistema,
      efectivo_contado: contado,
      diferencia: contado - corteEfectivoSistema,
      tarjeta_sistema: corteTarjetaSistema ?? 0,
      notas: corteNotas || null,
    })
    setCorteSaving(false)
    if (error) {
      alert('Error guardando corte: ' + error.message)
    } else {
      alert('✅ Corte guardado correctamente')
      setCorteEfectivoContado('')
      setCorteNotas('')
      setCorteCalculado(false)
      setCorteEfectivoSistema(null)
      setCorteTarjetaSistema(null)
      setCorteEgresosEfectivo(0)
      setCorteInicioFecha(null)
    }
  }

  // Solo pedidos con items sin pagar
  const ordersWithUnpaid = liveOrders.filter(order =>
    order.order_items.some((item: any) => !item.pagado && !item.cancelado)
  )

  const selectedOrder = ordersWithUnpaid.find(o => o.id === selectedOrderId)
  const unpaidItems = selectedOrder
    ? selectedOrder.order_items.filter((i: any) => !i.pagado && !i.cancelado)
    : []

  // Si el pedido seleccionado desaparece (fue cobrado desde mesero), limpiar
  useEffect(() => {
    if (selectedOrderId && !ordersWithUnpaid.find(o => o.id === selectedOrderId)) {
      setSelectedOrderId(null)
      setSelectedItems([])
      setMontoRecibidoStr('')
    }
  }, [liveOrders, selectedOrderId, ordersWithUnpaid])

  // Safety net: Fusionar pedidos duplicados en la misma mesa (datos legacy o fallos raros)
  useEffect(() => {
    if (!liveOrders || liveOrders.length === 0) return

    const tablesWithMultipleOrders = new Map<string, number>()
    liveOrders.forEach(order => {
      if (order.tipo === 'mesa' && order.estado === 'abierto' && order.table_id) {
        tablesWithMultipleOrders.set(order.table_id, (tablesWithMultipleOrders.get(order.table_id) || 0) + 1)
      }
    })

    const duplicateTableIds = Array.from(tablesWithMultipleOrders.entries())
      .filter(([_, count]) => count > 1)
      .map(([tableId, _]) => tableId)

    if (duplicateTableIds.length > 0) {
      const healDuplicates = async () => {
        let merged = false
        for (const tableId of duplicateTableIds) {
          const { error } = await supabase.rpc('fusionar_pedidos_duplicados_mesa', { p_table_id: tableId })
          if (!error) merged = true
        }
        if (merged) fetchOrders()
      }
      healDuplicates()
    }
  }, [liveOrders, supabase, fetchOrders])

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId)
    const order = ordersWithUnpaid.find(o => o.id === orderId)
    if (order) {
      setSelectedItems(
        order.order_items.filter((i: any) => !i.pagado && !i.cancelado).map((i: any) => i.id)
      )
    }
    setMontoRecibidoStr('')
  }

  const toggleItem = (itemId: string) =>
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    )

  const toggleGroupSelection = (groupIds: string[]) => {
    setSelectedItems(prev => {
      const allSelected = groupIds.every(id => prev.includes(id))
      if (allSelected) {
        return prev.filter(id => !groupIds.includes(id))
      } else {
        const set = new Set(prev)
        groupIds.forEach(id => set.add(id))
        return Array.from(set)
      }
    })
  }

  const toggleGroupExpand = (signature: string) => {
    setExpandedCheckoutGroups(prev => {
      const next = new Set(prev)
      if (next.has(signature)) next.delete(signature)
      else next.add(signature)
      return next
    })
  }

  const selectAll = () => setSelectedItems(unpaidItems.map((i: any) => i.id))

  const amountToPay = selectedItems.reduce((acc, itemId) => {
    const item = unpaidItems.find((i: any) => i.id === itemId)
    if (!item) return acc
    const extraMultipleCost = (item.order_item_extras || []).reduce((sum: number, ext: any) => sum + (ext.precio_adicional || 0), 0)
    return acc + (item.precio_unitario + (item.extra_precio || 0) + extraMultipleCost + (item.cargo_ingredientes_extra || 0)) * item.cantidad
  }, 0)

  const montoRecibido = parseFloat(montoRecibidoStr) || 0
  const cambio = paymentMethod === 'efectivo' ? Math.max(0, montoRecibido - amountToPay) : 0

  const handlePrintTicket = useCallback(async (ticket: PrintOrderData, reprint = false) => {
    if (printInFlightRef.current) {
      if (reprint) pushToast('Ya existe un ticket enviándose a la impresora.', 'info')
      return
    }
    printInFlightRef.current = true
    setIsPrinting(true)
    try {
      const result = await imprimirTicket(ticket, settings)
      if (result.channel === 'disabled') return
      if (result.success) {
        pushToast(reprint ? 'Ticket reimpreso correctamente.' : 'Ticket impreso automáticamente.', 'success')
      } else {
        pushToast(`El cobro quedó guardado, pero el ticket no se imprimió: ${result.message || 'revisa la conexión USB.'}`, 'info')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Caja] Error no controlado al imprimir:', error)
      pushToast(`El cobro quedó guardado, pero ocurrió un error de impresión: ${message}`, 'info')
    } finally {
      printInFlightRef.current = false
      setIsPrinting(false)
    }
  }, [pushToast, settings])

  const canCheckout =
    selectedItems.length > 0 &&
    !isSubmitting &&
    !isPrinting &&
    (paymentMethod === 'tarjeta' || (paymentMethod === 'efectivo' && montoRecibido >= amountToPay))

  const handlePrintKitchen = async (order: any) => {
    if (!settings?.impresora_cocina_activa) return
    const pendingItems = order.order_items.filter((i: any) => !i.cancelado && !i.enviado_a_cocina)
    if (pendingItems.length === 0) return

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

  const toggleCajaApertura = async () => {
    const newVal = !(settings?.caja_apertura_automatica ?? true)
    setSettings((prev: any) => ({ ...prev, caja_apertura_automatica: newVal }))
    const { error } = await supabase.from('settings').update({ caja_apertura_automatica: newVal }).eq('id', 1)
    if (error) {
      pushToast('Error al actualizar ajuste de cajón', 'info')
      setSettings((prev: any) => ({ ...prev, caja_apertura_automatica: !newVal }))
    } else {
      pushToast(newVal ? 'Apertura automática activada' : 'Apertura automática desactivada', 'success')
    }
  }

  const handleCheckout = async () => {
    if (!canCheckout || !selectedOrder) return

    const isOnline = navigator.onLine

    // Build ticket items (used in both online and offline paths)
    const selectedItemObjects = selectedItems.map(id => unpaidItems.find((i: any) => i.id === id)).filter(Boolean)
    const groupedSelected = groupOrderItems(selectedItemObjects)

    const itemsToPrint = groupedSelected.map(group => {
      const item = group.representante
      return {
        nombre: item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado',
        cantidad: group.cantidad_total,
        precio_unitario: item.precio_unitario,
        variante_nombre: item.nombre_variante || item.variante?.nombre,
        extras_pago: item.order_item_extras?.map((ep: any) => ({ nombre: ep.nombre_extra, precio: ep.precio_adicional })) || [],
        extra_nombre: item.extra?.nombre,
        extra_precio: item.extra_precio,
        ingredientes_seleccionados: item.ingredientes_seleccionados,
        cargo_ingredientes_extra: item.cargo_ingredientes_extra,
        notas: item.notas,
      }
    })
    const tipoPedido = selectedOrder.tipo === 'mesa'
      ? `Mesa ${selectedOrder.tables?.numero}`
      : selectedOrder.tipo === 'llevar' ? 'Para llevar'
      : selectedOrder.tipo === 'domicilio' ? 'A domicilio'
      : selectedOrder.tipo

    const printData: PrintOrderData = {
      orderId: selectedOrder.id,
      items: itemsToPrint,
      total: amountToPay,
      metodoPago: paymentMethod,
      fecha: new Date().toLocaleString(),
      tipoPedido,
      atendidoPor: employeeName,
      montoRecibido: paymentMethod === 'efectivo' ? montoRecibido : undefined,
      cambio: paymentMethod === 'efectivo' ? cambio : undefined,
    }

    // ── OFFLINE PATH ─────────────────────────────────────────────
    if (!isOnline) {
      if (paymentMethod === 'tarjeta') {
        // Cannot guarantee card payment without network — block it clearly
        alert('Sin conexión: El cobro con tarjeta requiere internet (la terminal física necesita conectividad). Por favor cobra en efectivo o espera a que se restaure la conexión.')
        return
      }

      // Cash offline — enqueue locally, NEVER block cashier
      const localId = crypto.randomUUID()
      const orderLabel = selectedOrder.tipo === 'mesa'
        ? `Mesa ${selectedOrder.tables?.numero}`
        : formatOrderType(selectedOrder.tipo)

      await enqueuePendingPayment({
        id: localId,
        type: 'procesar_pago',
        orderId: selectedOrder.id,
        tableId: selectedOrder.table_id,
        itemIds: selectedItems,
        metodo: 'efectivo',
        montoRecibido,
        montoCobrado: amountToPay,
        cambio,
        employeeId: employeeId,
        localOrderLabel: orderLabel,
      })

      await refreshQueue()

      // The local payment is already safe before attempting USB printing.
      await handlePrintTicket(printData)

      pushToast(`Cobro guardado localmente (sin conexión). Se sincronizará automáticamente al recuperar internet.`, 'success')
      setSelectedItems([])
      setMontoRecibidoStr('')
      return
    }

    // ── ONLINE PATH ─────────────────────────────────────────────
    setIsSubmitting(true)
    try {
      const res = await processPayment({
        orderId: selectedOrder.id,
        tableId: selectedOrder.table_id,
        itemIds: selectedItems,
        metodo: paymentMethod,
        montoRecibido: paymentMethod === 'efectivo' ? montoRecibido : 0,
        montoCobrado: amountToPay,
        cambio,
        employeeId: employeeId,
        idempotencyKey: crypto.randomUUID(),
      })

      if (res?.error) {
        alert('Error: ' + res.error)
        setIsSubmitting(false)
        return
      }
    } catch (err: any) {
      alert('Error inesperado al cobrar: ' + err.message)
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    setLastTicket(printData)
    await handlePrintTicket(printData)
    setSelectedItems([])
    setMontoRecibidoStr('')
  }

  const cancelMessage = (
    <div className="flex flex-col gap-3">
      <p>¿Motivo de cancelación?</p>
      <select
        className="border border-gray-300 rounded px-2 py-1 text-sm"
        value={cancelReason}
        onChange={e => setCancelReason(e.target.value)}
      >
        {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  )
  const requestCancel = (itemId: string, enviadoACocina: boolean) => {
    setCancelIsUnsent(!enviadoACocina)
    setItemToCancel(itemId)
    setCancelModalOpen(true)
  }

  return (
    <React.Fragment>
      <ToastContainer toasts={toasts} />

      {/* Modal cancelar item */}
      <ConfirmModal
        isOpen={cancelModalOpen}
        title={cancelIsUnsent ? 'Borrar producto' : 'Cancelar Producto'}
        variant="danger"
        onClose={() => { setCancelModalOpen(false); setItemToCancel(null); setCancelIsUnsent(false) }}
        onConfirm={async () => {
          if (!itemToCancel) return
          if (cancelIsUnsent) {
            await deleteOrderItemUnsent(itemToCancel)
            fetchOrders()
          } else {
            setIsSubmitting(true)
            const res = await cancelOrderItem(itemToCancel, cancelReason, employeeId)
            setIsSubmitting(false)
            if (res?.error) pushToast(res.error, 'info')
            else { pushToast('Producto cancelado', 'success'); fetchOrders() }
          }
          setCancelModalOpen(false)
          setItemToCancel(null)
          setCancelIsUnsent(false)
        }}
        message={cancelIsUnsent
          ? 'Este producto aún no fue enviado a cocina. Se eliminará del pedido sin dejar registro de cancelación.'
          : cancelMessage
        }
        confirmLabel={cancelIsUnsent ? 'Sí, borrar' : 'Sí, cancelar'}
      />

      <div className="flex flex-col flex-1 w-full min-h-0 gap-4">
      {/* Tabs */}
      <div className="flex border-b border-[var(--color-gris)]/20 bg-white rounded-t-xl overflow-hidden shadow-sm">
        <button
          className={`flex-1 py-4 font-bold tracking-wider uppercase text-xs transition-colors ${
            activeTab === 'cobro'
              ? 'bg-[var(--color-bronce)] text-white'
              : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
          }`}
          onClick={() => setActiveTab('cobro')}
        >
          Cobro de Cuentas
        </button>
        <button
          className={`flex-1 py-4 font-bold tracking-wider uppercase text-xs transition-colors ${
            activeTab === 'tomar_pedido'
              ? 'bg-[var(--color-bronce)] text-white'
              : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
          }`}
          onClick={() => setActiveTab('tomar_pedido')}
        >
          Tomar Pedido
        </button>
        <button
          className={`flex-1 py-4 font-bold tracking-wider uppercase text-xs transition-colors ${
            activeTab === 'egresos'
              ? 'bg-[var(--color-bronce)] text-white'
              : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
          }`}
          onClick={() => setActiveTab('egresos')}
        >
          Egresos
        </button>
        <button
          className={`flex-1 py-4 font-bold tracking-wider uppercase text-xs transition-colors ${
            activeTab === 'corte'
              ? 'bg-[var(--color-bronce)] text-white'
              : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
          }`}
          onClick={() => setActiveTab('corte')}
        >
          🏦 Corte
        </button>
      </div>

      {activeTab === 'tomar_pedido' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20">
          <div className="flex border-b border-[var(--color-gris)]/20">
            <button
              className={`flex-1 py-4 font-bold tracking-wider uppercase text-sm transition-colors ${
                tomarPedidoSubTab === 'nuevo'
                  ? 'bg-[var(--color-bronce)] text-white'
                  : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
              }`}
              onClick={() => { setTomarPedidoSubTab('nuevo'); setTargetOrderIdForAppend(null) }}
            >
              Nuevo Pedido
            </button>
            <button
              className={`flex-1 py-4 font-bold tracking-wider uppercase text-sm transition-colors ${
                tomarPedidoSubTab === 'activos'
                  ? 'bg-[var(--color-bronce)] text-white'
                  : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
              }`}
              onClick={() => { setTomarPedidoSubTab('activos'); setTargetOrderIdForAppend(null) }}
            >
              Activos ({liveOrders.length})
            </button>
            <button
              className={`flex-1 py-4 font-bold tracking-wider uppercase text-sm transition-colors ${
                tomarPedidoSubTab === 'historial'
                  ? 'bg-[var(--color-bronce)] text-white'
                  : 'hover:bg-[var(--color-crema)] text-[var(--color-gris)]'
              }`}
              onClick={() => { setTomarPedidoSubTab('historial'); setTargetOrderIdForAppend(null) }}
            >
              Historial ({historialHoy.length})
            </button>
          </div>

          <div className="flex-1 overflow-hidden relative flex flex-col">
            {tomarPedidoSubTab === 'nuevo' && (
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
                  setTomarPedidoSubTab('activos')
                  setTargetOrderIdForAppend(null)
                  fetchOrders()
                }}
              />
            )}
            
            {tomarPedidoSubTab === 'activos' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50/50 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 content-start">
                {liveOrders.length === 0 && (
                  <p className="text-center text-[var(--color-gris)] py-10">No hay pedidos abiertos.</p>
                )}
                {liveOrders.map(order => {
                  const tableLabel = order.tipo === 'mesa'
                    ? `Mesa ${order.tables?.numero ?? tables.find((t: any) => t.id === order.table_id)?.numero ?? ''}`
                    : formatOrderType(order.tipo)
                  const activeItems = order.order_items.filter((i: any) => !i.cancelado)
                  const readyCount = activeItems.filter((i: any) => i.listo).length
                  const allReady = activeItems.length > 0 && readyCount === activeItems.length
                  
                  return (
                    <div key={order.id} className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${allReady ? 'border-green-400 shadow-green-100' : 'border-[var(--color-gris)]/20'}`}>
                      <div className="flex justify-between items-center mb-4 border-b border-[var(--color-gris)]/10 pb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold uppercase tracking-widest text-base bg-[var(--color-crema)] px-2 py-1 rounded ${order.tipo !== 'mesa' ? getOrderTypeColorClass(order.tipo) : 'text-[var(--color-bronce)]'}`}>
                            {tableLabel} {order.nombre_cliente ? `(${order.nombre_cliente})` : ''}
                          </span>
                          {activeItems.some((i: any) => i.enviado_a_cocina) && (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                              allReady
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
                            setTomarPedidoSubTab('nuevo')
                          }}>
                            Agregar Más
                          </Button>
                          {order.order_items.some((i: any) => !i.cancelado && !i.enviado_a_cocina) && (
                            <Button
                              size="sm"
                              disabled={isSubmitting}
                              onClick={async () => {
                                setIsSubmitting(true)
                                await handlePrintKitchen(order)
                                const result = await sendToKitchen(order.id)
                                setIsSubmitting(false)
                                if (result?.error) {
                                  pushToast(result.error, 'info')
                                } else {
                                  pushToast('¡Orden enviada a cocina! 🍳', 'success')
                                  fetchOrders()
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
                    </div>
                  )
                })}
              </div>
            )}

            {tomarPedidoSubTab === 'historial' && (
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
                    : formatOrderType(order.tipo)
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
                      
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(order.payments || []).filter((p: any) => !p.anulado).map((p: any) => (
                          <div key={p.id} className="flex items-center gap-1.5 bg-[var(--color-crema)] px-2 py-1 rounded text-xs font-bold">
                            <span>{p.metodo === 'efectivo' ? '💵' : '💳'} ${Number(p.monto_cobrado).toFixed(2)}</span>
                            {employeeRol === 'admin' && (
                              <select
                                className="text-xs font-bold bg-white border border-[var(--color-gris)]/30 rounded px-1 py-0.5"
                                value={p.metodo}
                                onChange={async (e) => {
                                  const nuevoMetodo = e.target.value as 'efectivo' | 'tarjeta'
                                  const res = await updatePaymentMethod({ paymentId: p.id, nuevoMetodo, employeeId })
                                  if (res?.error) {
                                    pushToast(res.error, 'info')
                                  } else {
                                    pushToast('Método de pago actualizado', 'success')
                                    fetchOrders()
                                  }
                                }}
                              >
                                <option value="efectivo">Efectivo</option>
                                <option value="tarjeta">Tarjeta</option>
                              </select>
                            )}
                          </div>
                        ))}
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
      )}
      
      {activeTab === 'egresos' && (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20 p-6 flex flex-col items-center justify-center">
          <div className="w-full max-w-md bg-gray-50 border border-[var(--color-gris)]/20 p-6 rounded-xl shadow-sm">
            <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)] mb-6 text-center">Registrar Egreso</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">Monto</label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-[var(--color-gris)] font-bold">$</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    className="pl-7 font-bold text-lg h-12" 
                    value={expenseAmount}
                    onChange={e => setExpenseAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">Descripción</label>
                <Input 
                  className="h-12"
                  value={expenseDesc}
                  onChange={e => setExpenseDesc(e.target.value)}
                  placeholder="Ej: Pago a proveedor de agua..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">Método</label>
                <select 
                  className="w-full h-12 rounded-md border border-[var(--color-gris)]/30 px-3 bg-white"
                  value={expenseMethod}
                  onChange={(e: any) => setExpenseMethod(e.target.value)}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>

              <Button 
                className="w-full h-14 mt-4 text-lg" 
                disabled={!expenseAmount || !expenseDesc || isSubmittingExpense}
                onClick={async () => {
                  const val = parseFloat(expenseAmount)
                  if (!val || val <= 0) return alert('Monto inválido')
                  setIsSubmittingExpense(true)
                  const res = await addExpense({ monto: val, descripcion: expenseDesc, metodo: expenseMethod, employeeId })
                  setIsSubmittingExpense(false)
                  
                  if (res.error) {
                    alert('Error al registrar egreso: ' + res.error)
                  } else {
                    pushToast('Egreso registrado correctamente', 'success')
                    setExpenseAmount('')
                    setExpenseDesc('')
                  }
                }}
              >
                {isSubmittingExpense ? 'Guardando...' : 'Registrar Egreso'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'corte' && (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20 p-6 flex flex-col items-center justify-center">
          <div className="w-full max-w-lg bg-gray-50 border border-[var(--color-gris)]/20 p-6 rounded-xl shadow-sm space-y-6">
            <div className="text-center">
              <div className="text-4xl mb-2">🏦</div>
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Corte de Caja</h2>
              <p className="text-xs text-[var(--color-gris)] mt-1">
                Cajero: <span className="font-bold">{employeeName}</span>
              </p>
            </div>

            {!corteCalculado ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-[var(--color-gris)]">
                  Calcula el efectivo y tarjeta recibidos desde el último corte (o desde el inicio del día).
                </p>
                <Button className="w-full h-14 text-lg" onClick={calcularCorte}>
                  Calcular Corte
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Resumen del sistema */}
                <div className="bg-white border border-[var(--color-gris)]/20 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider">Resumen del Sistema</p>
                  <div className="flex justify-between items-center text-xs text-[var(--color-gris)]">
                    <span>Ventas en efectivo</span>
                    <span>${((corteEfectivoSistema ?? 0) + corteEgresosEfectivo).toFixed(2)}</span>
                  </div>
                  {corteEgresosEfectivo > 0 && (
                    <div className="flex justify-between items-center text-xs text-red-500">
                      <span>− Egresos pagados en efectivo</span>
                      <span>-${corteEgresosEfectivo.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-gris)]">💵 Efectivo esperado (Sistema)</span>
                    <span className="font-bold text-xl text-[var(--color-negro)]">${(corteEfectivoSistema ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--color-gris)]">💳 Tarjeta esperada</span>
                    <span className="font-bold text-[var(--color-gris)]">${(corteTarjetaSistema ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Monto físico contado */}
                <div>
                  <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">
                    Efectivo real (Contado en cajón)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-3.5 text-[var(--color-gris)] font-bold">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="pl-7 font-bold text-lg h-12"
                      value={corteEfectivoContado}
                      onChange={e => setCorteEfectivoContado(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Diferencia en tiempo real */}
                {corteEfectivoContado !== '' && !isNaN(parseFloat(corteEfectivoContado)) && (() => {
                  const diff = parseFloat(corteEfectivoContado) - (corteEfectivoSistema ?? 0)
                  return (
                    <div className={`flex justify-between items-center p-3 rounded-xl font-bold ${
                      diff === 0 ? 'bg-green-50 text-green-700' : diff > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'
                    }`}>
                      <span>Diferencia</span>
                      <span className="text-xl">{diff >= 0 ? '+' : ''}{diff.toFixed(2)}</span>
                    </div>
                  )
                })()}

                {/* Notas */}
                <div>
                  <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">Notas (opcional)</label>
                  <Input
                    className="h-10"
                    value={corteNotas}
                    onChange={e => setCorteNotas(e.target.value)}
                    placeholder="Ej: Se quedaron $200 en caja chica"
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-14 text-lg" onClick={() => setCorteCalculado(false)}>
                    Recalcular
                  </Button>
                  <Button
                    className="flex-1 h-14 text-lg"
                    disabled={corteSaving || !corteEfectivoContado}
                    onClick={guardarCorte}
                  >
                    {corteSaving ? 'Guardando...' : 'Guardar Corte'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'cobro' && (
        <div className="grid grid-cols-1 md:grid-cols-3 md:grid-rows-1 gap-6 flex-1 min-h-0">
          {/* Lista de pedidos */}
          <div className="bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20 overflow-y-auto min-h-0 p-4 flex flex-col gap-3">
        <div className="flex flex-col mb-4 gap-3 border-b border-[var(--color-gris)]/20 pb-4">
          <div className="flex items-center gap-2">
            <h2 className="font-serif font-bold text-xl text-[var(--color-bronce)]">Cuentas por Cobrar</h2>
            <span className="text-xs font-bold bg-[var(--color-crema)] text-[var(--color-bronce)] px-2 py-1 rounded">
              {ordersWithUnpaid.length}
            </span>
          </div>
          {lastTicket && (
            <button
              className="text-xs font-bold uppercase tracking-wider bg-[var(--color-bronce)] text-white py-2 px-3 rounded shadow-sm self-start hover:bg-opacity-90 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => void handlePrintTicket(lastTicket, true)}
              disabled={isPrinting}
            >
              {isPrinting ? '⏳ Imprimiendo…' : '🖨️ Reimprimir Ticket'}
            </button>
          )}
          {/* Pending offline payments banner */}
          {isSyncing && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg flex items-center gap-2">
              <span className="animate-spin">⏳</span> Sincronizando cobros pendientes...
            </div>
          )}
          {pendingPayments.length > 0 && !isSyncing && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pendiente de sincronizar ({pendingPayments.length})</p>
              {pendingPayments.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs font-bold text-amber-800">{p.localOrderLabel}</span>
                    <span className="ml-2 text-xs text-amber-600">${p.montoCobrado.toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wide">📡 Sin conexión</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {ordersWithUnpaid.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center text-[var(--color-gris)]">
            <div className="text-4xl mb-2">🎉</div>
            <p className="font-semibold">Sin cuentas pendientes</p>
            <p className="text-xs mt-1">Las nuevas órdenes aparecerán aquí automáticamente.</p>
          </div>
        )}

        {ordersWithUnpaid.map(order => {
          const pendingCount = order.order_items.filter((i: any) => !i.pagado && !i.cancelado).length
          const total = order.order_items
            .filter((i: any) => !i.cancelado)
            .reduce((acc: number, i: any) =>
              acc + (i.precio_unitario + (i.extra_precio || 0) + (i.order_item_extras?.reduce((sum: number, ep: any) => sum + (ep.precio_adicional || 0), 0) || 0) + (i.cargo_ingredientes_extra || 0)) * i.cantidad, 0)

          return (
            <button
              key={order.id}
              className={`text-left p-4 rounded-xl border transition-all active:scale-95 ${
                selectedOrderId === order.id
                  ? 'border-[var(--color-bronce)] bg-[var(--color-crema)] ring-1 ring-[var(--color-bronce)]'
                  : 'border-[var(--color-gris)]/20 hover:border-[var(--color-bronce)]'
              }`}
              onClick={() => handleSelectOrder(order.id)}
            >
              <div className="font-bold text-lg leading-none mb-1">
                {order.tipo === 'mesa' ? `Mesa ${order.tables?.numero}` : `${formatOrderType(order.tipo)}${order.nombre_cliente ? ` - ${order.nombre_cliente}` : ''}`}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="text-sm text-[var(--color-gris)]">{pendingCount} item{pendingCount !== 1 ? 's' : ''}</div>
                <div className="font-bold text-[var(--color-bronce)] text-lg">${total.toFixed(2)}</div>
              </div>
              {order.enviado_a_cocina && (
                <div className="mt-1.5">
                  {order.order_items.filter((i: any) => !i.cancelado).every((i: any) => i.listo)
                    ? <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">🍽️ LISTO</span>
                    : <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">🔥 EN COCINA</span>
                  }
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Panel de cobro */}
      {selectedOrder ? (
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20 flex flex-col overflow-hidden min-h-0">
          <div className="p-4 bg-[var(--color-crema)] border-b border-[var(--color-bronce)]/20 flex justify-between items-center">
            <h2 className="font-serif font-bold text-xl text-[var(--color-bronce)]">
              Cobro: {selectedOrder.tipo === 'mesa' ? `Mesa ${selectedOrder.tables?.numero}` : `${formatOrderType(selectedOrder.tipo)}${selectedOrder.nombre_cliente ? ` (${selectedOrder.nombre_cliente})` : ''}`}
            </h2>
            <Button size="sm" variant="outline" onClick={selectAll}>Seleccionar Todo</Button>
          </div>

          {/* Selección de items */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 border-b border-[var(--color-gris)]/20">
            <p className="text-xs text-[var(--color-gris)] mb-2 uppercase tracking-wider font-bold">
              Selecciona los items a cobrar
            </p>
            {groupOrderItems(unpaidItems).map((group: GroupedOrderItem) => {
              const item = group.representante
              const isExpanded = expandedCheckoutGroups.has(group.signature)
              const selectedCount = group.ids.filter(id => selectedItems.includes(id)).length
              const allSelected = selectedCount === group.ids.length
              const someSelected = selectedCount > 0 && !allSelected

              return (
                <div key={group.signature} className="border border-[var(--color-gris)]/20 rounded-lg overflow-hidden transition-colors">
                  <div
                    className={`flex justify-between items-center p-4 transition-colors active:scale-[0.98] ${
                      allSelected
                        ? 'bg-amber-50/50'
                        : someSelected
                        ? 'bg-gray-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => toggleGroupSelection(group.ids)}
                    >
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-[var(--color-gris)] text-[var(--color-bronce)] pointer-events-none"
                        checked={allSelected}
                        ref={el => {
                          if (el) el.indeterminate = someSelected
                        }}
                        readOnly
                      />
                      <span className="font-bold w-6 text-lg">{group.cantidad_total}x</span>
                      <div className="flex flex-col">
                        <span className="font-semibold">{item.nombre_producto ?? item.product?.nombre ?? 'Producto eliminado'}</span>
                        {(item.nombre_variante || item.variante?.nombre) && (
                          <span className="text-xs font-bold text-purple-600">◆ {item.nombre_variante || item.variante?.nombre}</span>
                        )}
                        {item.order_item_extras?.length > 0 && (
                          <div className="space-y-0">
                            {item.order_item_extras.map((ep: any, i: number) => (
                              <div key={i} className="text-sm text-[var(--color-bronce)] font-semibold">+ {ep.nombre_extra} <span className="font-bold">+${ep.precio_adicional}</span></div>
                            ))}
                          </div>
                        )}
                        {item.ingredientes_seleccionados?.length > 0 && (
                          <span className="text-[10px] text-[var(--color-gris)] italic">
                            Con: {item.ingredientes_seleccionados.join(', ')}
                            {item.cargo_ingredientes_extra > 0 ? ` (+$${item.cargo_ingredientes_extra})` : ''}
                          </span>
                        )}
                        {item.extra_id && (
                          <span className="text-sm text-[var(--color-bronce)] font-semibold">+ {item.extra?.nombre}</span>
                        )}
                        <span className="text-[10px] text-[var(--color-gris)] mt-0.5">
                          {item.creador
                            ? `Agregado por: ${item.creador.nombre} (${item.creador.rol})`
                            : 'Sin registro'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-bold text-base">
                        ${(group.items_originales.reduce((acc, i) => acc + ((i.precio_unitario + (i.extra_precio || 0) + (i.order_item_extras?.reduce((sum: number, ep: any) => sum + (ep.precio_adicional || 0), 0) || 0) + (i.cargo_ingredientes_extra || 0)) * i.cantidad), 0)).toFixed(2)}
                      </span>
                      {group.ids.length > 1 && (
                        <button
                          className="text-[10px] flex items-center text-gray-500 hover:text-gray-700 bg-gray-100 px-2 py-1 rounded"
                          onClick={() => toggleGroupExpand(group.signature)}
                        >
                          {isExpanded ? <ChevronUp size={12} className="mr-1" /> : <ChevronDown size={12} className="mr-1" />}
                          {isExpanded ? 'Ocultar' : 'Desglosar'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {isExpanded && group.ids.length > 1 && (
                    <div className="bg-gray-50/50 border-t border-[var(--color-gris)]/10 p-2 pl-12 space-y-1">
                      {group.items_originales.map((unit: any, idx: number) => {
                        const isUnitSelected = selectedItems.includes(unit.id)
                        return (
                          <div
                            key={unit.id}
                            className="flex justify-between items-center py-1 px-2 hover:bg-gray-100 rounded cursor-pointer"
                            onClick={() => toggleItem(unit.id)}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-[var(--color-gris)] text-[var(--color-bronce)] pointer-events-none"
                                checked={isUnitSelected}
                                readOnly
                              />
                              <span className="text-xs text-gray-600">Unidad {idx + 1}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-700">
                                ${((unit.precio_unitario + (unit.extra_precio || 0) + (unit.order_item_extras?.reduce((sum: number, ep: any) => sum + (ep.precio_adicional || 0), 0) || 0) + (unit.cargo_ingredientes_extra || 0)) * unit.cantidad).toFixed(2)}
                              </span>
                              <button
                                className="text-xs text-red-500 hover:text-red-700 font-bold px-1 py-0.5 rounded hover:bg-red-50 transition"
                                title="Cancelar producto"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  requestCancel(unit.id, unit.enviado_a_cocina)
                                }}
                              >
                                {unit.enviado_a_cocina ? 'Cancelar' : 'Borrar'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

          </div>

          {/* Detalles de pago */}
          <div className="p-4 bg-gray-50 flex flex-col gap-4 safe-bottom">
            <div className="flex justify-between items-center text-xl font-bold">
              <span>Total a Cobrar:</span>
              <span className="text-[var(--color-bronce)]">${amountToPay.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <Button
                variant={paymentMethod === 'efectivo' ? 'primary' : 'outline'}
                className="flex-1"
                onClick={() => setPaymentMethod('efectivo')}
              >
                💵 Efectivo
              </Button>
              <Button
                variant={paymentMethod === 'tarjeta' ? 'primary' : 'outline'}
                className="flex-1"
                onClick={() => { setPaymentMethod('tarjeta'); setMontoRecibidoStr('') }}
              >
                💳 Tarjeta
              </Button>
            </div>

            {paymentMethod === 'efectivo' && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">Recibido</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-[var(--color-gris)] font-bold">$</span>
                    <Input
                      type="number"
                      className="pl-7 font-bold text-lg"
                      value={montoRecibidoStr}
                      onChange={e => setMontoRecibidoStr(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-1">Cambio</label>
                  <div className={`h-12 flex items-center px-3 rounded-md border text-lg font-bold ${
                    cambio > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-[var(--color-gris)]/20 text-gray-500'
                  }`}>
                    ${cambio.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-2">
              <button
                className="flex items-center gap-1.5 text-xs text-[var(--color-gris)] hover:text-[var(--color-bronce)] bg-[var(--color-crema)] px-3 py-2 rounded border border-[var(--color-gris)]/20 transition-colors"
                onClick={toggleCajaApertura}
                title="Alternar apertura automática del cajón de dinero"
              >
                {settings?.caja_apertura_automatica ?? true ? (
                  <><Unlock size={14} className="text-green-600" /> <span className="font-semibold text-[var(--color-negro)]">Cajón: abre al cobrar</span></>
                ) : (
                  <><Lock size={14} className="text-orange-600" /> <span className="font-semibold text-[var(--color-negro)]">Cajón: no abre</span></>
                )}
              </button>
              {settings?.impresora_modo === 'red' && (
                <div className="text-[10px] text-orange-600 max-w-[220px] text-right leading-tight">
                  El cajón no puede abrirse automáticamente con impresión por red. Requiere USB (QZ Tray) o app Android.
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full h-16 text-xl mt-2"
              disabled={!canCheckout}
              onClick={handleCheckout}
            >
              {isSubmitting ? 'Procesando...' : 'Cobrar e Imprimir Ticket'}
            </Button>

            {/* Enviar a Cocina — visible solo si hay items no enviados */}
            {selectedOrder.order_items.some((i: any) => !i.enviado_a_cocina && !i.cancelado && !i.pagado) && (
              <button
                className="w-full py-2 text-xs font-bold uppercase tracking-wider border border-[var(--color-bronce)] text-[var(--color-bronce)] rounded hover:bg-[var(--color-crema)] transition"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true)
                  await handlePrintKitchen(selectedOrder)
                  const res = await sendToKitchen(selectedOrder.id, crypto.randomUUID())
                  setIsSubmitting(false)
                  if (res?.error) pushToast(res.error, 'info')
                  else { pushToast('¡Orden enviada a cocina! 🍳', 'success'); fetchOrders() }
                }}
              >
                🍳 Enviar a Cocina
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="md:col-span-2 bg-white/50 rounded-xl border border-[var(--color-gris)]/10 flex flex-col items-center justify-center gap-3 text-[var(--color-gris)] p-8 text-center min-h-0">
          <div className="text-5xl">🧾</div>
          <p className="font-semibold text-lg">Selecciona una cuenta para iniciar el cobro.</p>
          <p className="text-sm">Las órdenes se actualizan automáticamente en tiempo real.</p>
        </div>
      )}
        </div>
      )}
      </div>
    </React.Fragment>
  )
}
