'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, addDays, subWeeks, addWeeks, subMonths, addMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { getCroppedImg } from '@/utils/cropImage'
import { createEmployee, updateEmployee, deleteEmployee } from './actions'
import { updatePaymentMethod } from '@/app/caja/actions'
import { detectarImpresoras } from '@/utils/printTicket'
import { AndroidPrinterPanel } from '@/components/AndroidPrinterPanel'
import { AndroidBluetoothPrinterPanel } from '@/components/AndroidBluetoothPrinterPanel'
import { 
  LayoutDashboard, Coffee, Users, Table2, ArrowRightLeft,
  Plus, Edit, Trash2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Download, RefreshCw, X, Loader2, MoreHorizontal
} from 'lucide-react'
import GeneralInventoryAdmin from '@/components/GeneralInventoryAdmin'
import dynamic from 'next/dynamic'
import Image from 'next/image'

const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false })
const PieChart = dynamic(() => import('recharts').then(mod => mod.PieChart), { ssr: false })

import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, Pie, Cell, Legend } from 'recharts'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Cropper = dynamic(() => import('react-easy-crop'), { ssr: false }) as any

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'ventas', label: 'Ventas', icon: FileText },
  { id: 'productos', label: 'Productos', icon: Coffee },
  { id: 'mesas', label: 'Mesas', icon: Table2 },
  { id: 'empleados', label: 'Empleados', icon: Users },
  { id: 'movimientos', label: 'Movimientos', icon: ArrowRightLeft },
  { id: 'cortes', label: 'Cortes de Caja', icon: FileText },
  { id: 'configuracion', label: 'Configuración', icon: Edit },
]

const formatOrderType = (t: string) => {
  if (t === 'mesa') return 'En Mesa'
  if (t === 'para_llevar') return 'Para Llevar'
  if (t === 'domicilio') return 'A Domicilio'
  return t
}

export default function AdminView({ employeeId }: { employeeId: string }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [productSubTab, setProductSubTab] = useState<'catalogo'|'inventario'>('catalogo')
  const supabase = useRef(createClient()).current
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  
  // Data States
  const [products, setProducts] = useState<any[]>([])
  const [tables, setTables] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [topProductSort, setTopProductSort] = useState<'cantidad' | 'ingreso'>('cantidad')
  
  // Dashboard states
  const [dashboardTab, setDashboardTab] = useState<'resumen' | 'top_productos' | 'empleados'>('resumen')
  const [dashboardPeriod, setDashboardPeriod] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [ventasPeriod, setVentasPeriod] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [ventasCurrentDate, setVentasCurrentDate] = useState(new Date())
  const [ventasPayments, setVentasPayments] = useState<any[]>([])
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [ventasPage, setVentasPage] = useState(1)
  const VENTAS_PER_PAGE = 20

  // Archive / delete month states
  const [mostrarArchivados, setMostrarArchivados] = useState(false)
  const [mesArchivado, setMesArchivado] = useState<boolean | null>(null) // null = unknown
  const [archivandoMes, setArchivandoMes] = useState(false)
  const [exportedMonth, setExportedMonth] = useState(false)
  const [desarchivandoMes, setDesarchivandoMes] = useState(false)
  const [deletingMonth, setDeletingMonth] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  // QZ Tray printer detection
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([])
  const [detectingPrinters, setDetectingPrinters] = useState(false)
  const [printerDetectError, setPrinterDetectError] = useState<string | null>(null)
  const [printerMode, setPrinterMode] = useState('red')
  const [kitchenPrinterMode, setKitchenPrinterMode] = useState('red')

  // Ticket preview state
  const [ticketPreview, setTicketPreview] = useState({
    tamano: 'normal',
    mensaje: '¡Gracias por su compra! Vuelva pronto.',
    atendido: true,
    logo: true,
    negocioNombre: "Cristi's Coffe & Snack",
    negocioDireccion: '',
    negocioTelefono: '',
    negocioRfc: '',
    lineaExtra: '',
    logoUrl: ''
  })
  const [logoUploading, setLogoUploading] = useState(false)
  
  // Cropper state
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  // Cortes de caja
  const [cortes, setCortes] = useState<any[]>([])
  const [loadingCortes, setLoadingCortes] = useState(false)

  // Stock quick-add
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [stockAddingId, setStockAddingId] = useState<string | null>(null)

  const handleQuickAddStock = async (product: any) => {
    const input = prompt(`¿Cuántas unidades agregar al stock de "${product.nombre}"?\nStock actual: ${product.stock_actual ?? 0}`, '1')
    if (!input || isNaN(Number(input)) || Number(input) <= 0) return
    const cantidad = parseInt(input)
    setStockAddingId(product.id)
    const { error } = await supabase
      .from('products')
      .update({ stock_actual: (product.stock_actual ?? 0) + cantidad })
      .eq('id', product.id)
    setStockAddingId(null)
    if (error) alert('Error al actualizar stock: ' + error.message)
    else loadData()
  }

  const loadCortes = async () => {
    setLoadingCortes(true)
    const { data } = await supabase
      .from('cortes_caja')
      .select('*, empleado:employees(nombre)')
      .order('creado_en', { ascending: false })
      .limit(50)
    setCortes(data || [])
    setLoadingCortes(false)
  }
  
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    switch (dashboardPeriod) {
      case 'semana':
        return { 
          startDate: startOfWeek(currentDate, { weekStartsOn: 1 }), endDate: endOfWeek(currentDate, { weekStartsOn: 1 }),
          prevStartDate: subWeeks(startOfWeek(currentDate, { weekStartsOn: 1 }), 1), prevEndDate: subWeeks(endOfWeek(currentDate, { weekStartsOn: 1 }), 1)
        }
      case 'mes':
        return { 
          startDate: startOfMonth(currentDate), endDate: endOfMonth(currentDate),
          prevStartDate: subMonths(startOfMonth(currentDate), 1), prevEndDate: subMonths(endOfMonth(currentDate), 1)
        }
      case 'dia':
      default:
        return { 
          startDate: startOfDay(currentDate), endDate: endOfDay(currentDate),
          prevStartDate: subDays(startOfDay(currentDate), 1), prevEndDate: subDays(endOfDay(currentDate), 1)
        }
    }
  }, [currentDate, dashboardPeriod])

  const { vStartDate, vEndDate } = useMemo(() => {
    switch (ventasPeriod) {
      case 'semana':
        return { 
          vStartDate: startOfWeek(ventasCurrentDate, { weekStartsOn: 1 }), vEndDate: endOfWeek(ventasCurrentDate, { weekStartsOn: 1 })
        }
      case 'mes':
        return { 
          vStartDate: startOfMonth(ventasCurrentDate), vEndDate: endOfMonth(ventasCurrentDate)
        }
      case 'dia':
      default:
        return { 
          vStartDate: startOfDay(ventasCurrentDate), vEndDate: endOfDay(ventasCurrentDate)
        }
    }
  }, [ventasCurrentDate, ventasPeriod])

  const navigatePeriod = (direction: -1 | 1) => {
    setCurrentDate(prev => {
      if (dashboardPeriod === 'dia') return direction === 1 ? addDays(prev, 1) : subDays(prev, 1)
      if (dashboardPeriod === 'semana') return direction === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1)
      return direction === 1 ? addMonths(prev, 1) : subMonths(prev, 1)
    })
  }

  const navigateVentasPeriod = (direction: -1 | 1) => {
    setVentasCurrentDate(prev => {
      if (ventasPeriod === 'dia') return direction === 1 ? addDays(prev, 1) : subDays(prev, 1)
      if (ventasPeriod === 'semana') return direction === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1)
      return direction === 1 ? addMonths(prev, 1) : subMonths(prev, 1)
    })
  }
  
  const formatPeriodTitle = () => {
    if (dashboardPeriod === 'dia') return format(currentDate, "EEEE, d 'de' MMMM", { locale: es })
    if (dashboardPeriod === 'semana') return `Semana del ${format(startDate, "d MMM", { locale: es })} al ${format(endDate, "d MMM", { locale: es })}`
    return format(currentDate, "MMMM yyyy", { locale: es })
  }

  const formatVentasPeriodTitle = () => {
    if (ventasPeriod === 'dia') return format(ventasCurrentDate, "EEEE, d 'de' MMMM", { locale: es })
    if (ventasPeriod === 'semana') return `Semana del ${format(vStartDate, "d MMM", { locale: es })} al ${format(vEndDate, "d MMM", { locale: es })}`
    return format(ventasCurrentDate, "MMMM yyyy", { locale: es })
  }

  const [metrics, setMetrics] = useState({ 
    efectivo: 0, 
    tarjeta: 0, 
    cancelaciones: 0,
    ingresosManuales: 0,
    egresosManuales: 0
  })
  const [prevMetrics, setPrevMetrics] = useState({ neto: 0 })
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [hourlySales, setHourlySales] = useState<{hour: string, monto: number}[]>([])
  const [employeeStats, setEmployeeStats] = useState<any[]>([])
  const [notaDia, setNotaDia] = useState<any>(null)
  const [notaDiaText, setNotaDiaText] = useState('')
  const [savingNota, setSavingNota] = useState(false)

  // Pagination for movements
  const [movementsPage, setMovementsPage] = useState(1)
  const MOVEMENTS_PER_PAGE = 10

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUser(user.id)

    const startStr = startDate.toISOString()
    const endStr = endDate.toISOString()

    setLoadError(null)

    let movsQuery = supabase.from('movements')
      .select('*, created_by:employees(nombre)')
      .gte('fecha', startStr)
      .lte('fecha', endStr)
      .order('fecha', { ascending: false })
    if (!mostrarArchivados) movsQuery = (movsQuery as any).eq('archivado', false)

    // Basic data loads
    const [pRes, tRes, eRes, mRes, sRes, cRes, nRes] = await Promise.all([
      supabase.from('products').select('*').order('categoria'),
      supabase.from('tables').select('*').order('numero'),
      supabase.from('employees').select('*').order('creado_en'),
      movsQuery,
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('categories').select('*').order('orden'),
      supabase.from('notas_diarias').select('*').eq('fecha', format(startDate, 'yyyy-MM-dd')).maybeSingle()
    ])
    if (pRes.error) { console.error('[Dashboard] Error cargando products:', pRes.error); setLoadError(pRes.error.message); }
    if (tRes.error) { console.error('[Dashboard] Error cargando tables:', tRes.error); setLoadError(tRes.error.message); }
    if (eRes.error) { console.error('[Dashboard] Error cargando employees:', eRes.error); setLoadError(eRes.error.message); }
    if (mRes.error) { console.error('[Dashboard] Error cargando movements:', mRes.error); setLoadError(mRes.error.message); }

    if (pRes.data) setProducts(pRes.data)
    if (tRes.data) setTables([...tRes.data].sort((a: any, b: any) => a.numero.localeCompare(b.numero, undefined, {numeric: true})))
    if (eRes.data) setEmployees(eRes.data)
    if (mRes.data) setMovements(mRes.data)
    if (sRes.data) {
      setSettings(sRes.data)
      setPrinterMode(sRes.data.impresora_modo || 'red')
      setKitchenPrinterMode(sRes.data.impresora_cocina_modo || 'red')
      setTicketPreview({
        tamano: sRes.data.ticket_tamano_fuente || 'normal',
        mensaje: sRes.data.ticket_mensaje_despedida || '¡Gracias por su compra!',
        atendido: sRes.data.ticket_mostrar_atendido_por !== false,
        logo: sRes.data.ticket_mostrar_logo !== false,
        negocioNombre: sRes.data.negocio_nombre ?? "Cristi's Coffe & Snack",
        negocioDireccion: sRes.data.negocio_direccion ?? '',
        negocioTelefono: sRes.data.negocio_telefono ?? '',
        negocioRfc: sRes.data.negocio_rfc ?? '',
        lineaExtra: sRes.data.ticket_linea_extra ?? '',
        logoUrl: sRes.data.ticket_logo_url ?? ''
      })
    }
    if (cRes.data) setCategories(cRes.data)
    
    if (nRes.data) {
      setNotaDia(nRes.data)
      setNotaDiaText(nRes.data.contenido)
    } else {
      setNotaDia(null)
      setNotaDiaText('')
    }

    // Metrics (Filtered by selectedDate)
    let paysQuery = supabase.from('payments')
      .select('*, order:orders(*, tables(numero), order_items(*, product:products(nombre), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional))), cobrador:employees!cobrado_por(nombre)')
      .gte('creado_en', startStr)
      .lte('creado_en', endStr)
      .order('creado_en', { ascending: false })
    if (!mostrarArchivados) paysQuery = (paysQuery as any).eq('archivado', false)
    const { data: pays, error: paysError } = await paysQuery
    if (paysError) { console.error('[Dashboard] Error cargando payments:', paysError); setLoadError(paysError.message); }
      
    // Previous Period Metrics
    let prevPaysQuery = supabase.from('payments')
      .select('monto_cobrado, anulado')
      .gte('creado_en', prevStartDate.toISOString())
      .lte('creado_en', prevEndDate.toISOString())
    if (!mostrarArchivados) prevPaysQuery = (prevPaysQuery as any).eq('archivado', false)
    const { data: prevPays, error: prevPaysError } = await prevPaysQuery
    if (prevPaysError) { console.error('[Dashboard] Error cargando prev payments:', prevPaysError); setLoadError(prevPaysError.message); }
      
    let prevMovsQuery = supabase.from('movements')
      .select('tipo, monto')
      .gte('fecha', prevStartDate.toISOString())
      .lte('fecha', prevEndDate.toISOString())
    if (!mostrarArchivados) prevMovsQuery = (prevMovsQuery as any).eq('archivado', false)
    const { data: prevMovs, error: prevMovsError } = await prevMovsQuery
    if (prevMovsError) { console.error('[Dashboard] Error cargando prev movements:', prevMovsError); setLoadError(prevMovsError.message); }

    // Detect if the current month has archived records (for archive/delete UI), regardless of the current view
    const pStartMonth = startOfMonth(currentDate).toISOString()
    const pEndMonth = endOfMonth(currentDate).toISOString()
    const { count } = await supabase.from('payments')
      .select('id', { count: 'exact', head: true })
      .gte('creado_en', pStartMonth)
      .lte('creado_en', pEndMonth)
      .eq('archivado', true)
    setMesArchivado((count ?? 0) > 0)

    let prevNeto = 0
    if (prevPays) {
      prevPays.forEach(p => { if (!p.anulado) prevNeto += p.monto_cobrado })
    }
    if (prevMovs) {
      prevMovs.forEach(m => {
        if (m.tipo === 'ingreso') prevNeto += m.monto
        if (m.tipo === 'egreso') prevNeto -= m.monto
      })
    }
    setPrevMetrics({ neto: prevNeto })

    if (pays && mRes.data) {
      setPayments(pays)
      let ef = 0, tj = 0;
      pays.forEach(p => {
        if (!p.anulado) {
          p.metodo === 'efectivo' ? ef += p.monto_cobrado : tj += p.monto_cobrado
        }
      })
      
      let ingMan = 0, egMan = 0;
      mRes.data.forEach(m => {
        if (m.tipo === 'ingreso') ingMan += m.monto
        if (m.tipo === 'egreso') egMan += m.monto
      })
      
      const { data: allOrderItems, error: oiError } = await supabase.from('order_items')
        .select('id, creado_por, cancelado_por, cancelado, cantidad, creado_en')
        .gte('creado_en', startStr)
        .lte('creado_en', endStr)

      if (oiError) { console.error('[Dashboard] Error cargando order_items:', oiError); setLoadError(oiError.message); }

      console.log('[Dashboard] allOrderItems count:', allOrderItems?.length, 'error:', oiError?.message)
      console.log('[Dashboard] eRes.data count:', eRes.data?.length, 'error:', eRes.error?.message)
      console.log('[Dashboard] pays count:', pays?.length)
        
      const cancels = allOrderItems ? allOrderItems.filter(i => i.cancelado).length : 0
      
      setMetrics({ 
        efectivo: ef, 
        tarjeta: tj, 
        cancelaciones: cancels,
        ingresosManuales: ingMan,
        egresosManuales: egMan
      })

      // Compute Top Products
      const productCounts: Record<string, { nombre: string, cant: number, total: number }> = {}
      pays.forEach(p => {
        if (p.anulado) return
        p.order?.order_items?.forEach((item: any) => {
          if (item.cancelado) return
          const key = item.product?.nombre || item.nombre_producto || 'Desconocido'
          if (!productCounts[key]) productCounts[key] = { nombre: key, cant: 0, total: 0 }
          productCounts[key].cant += item.cantidad
          productCounts[key].total += item.cantidad * item.precio_unitario
        })
      })
      setTopProducts(Object.values(productCounts))
      
      // Compute Hourly Sales
      const hourlyData: Record<string, number> = {}
      pays.forEach(p => {
        if (p.anulado) return
        const hour = new Date(p.creado_en).getHours().toString().padStart(2, '0') + ':00'
        hourlyData[hour] = (hourlyData[hour] || 0) + p.monto_cobrado
      })
      const hourlyArray = Object.keys(hourlyData).map(h => ({ hour: h, monto: hourlyData[h] }))
      hourlyArray.sort((a, b) => a.hour.localeCompare(b.hour))
      setHourlySales(hourlyArray)
      
      // Compute Employee Stats
      const empList = eRes.data || []
      console.log('[Dashboard] Computing employee stats for', empList.length, 'employees')
      const stats = empList.map(emp => {
        const empPays = pays.filter(p => p.cobrado_por === emp.id && !p.anulado)
        const cobrado = empPays.reduce((acc, p) => acc + p.monto_cobrado, 0)
        const itemsArr = allOrderItems || []
        const agregados = itemsArr.filter(i => i.creado_por === emp.id && !i.cancelado).reduce((acc, i) => acc + i.cantidad, 0)
        const cancelaciones = itemsArr.filter(i => i.cancelado_por === emp.id).length
        console.log(`  ${emp.nombre}: cobrado=${cobrado}, agregados=${agregados}, cancelaciones=${cancelaciones}`)
        return { ...emp, cobrado, agregados, cancelaciones }
      })
      setEmployeeStats(stats)
    }
  }

  useEffect(() => {
    // Reset archive UI state when period/date changes
    setMostrarArchivados(false)
    loadData()
  }, [activeTab, currentDate, dashboardPeriod, mostrarArchivados]) // Reload when switching tabs, period, date, or archive toggle

  useEffect(() => {
    if (activeTab !== 'ventas') return
    const loadVentasData = async () => {
      let paysQuery = supabase.from('payments')
        .select('*, order:orders(*, tables(numero), order_items(*, product:products(nombre), extra:product_extras!extra_id(nombre), order_item_extras(extra_id, nombre_extra, precio_adicional))), cobrador:employees!cobrado_por(nombre)')
        .gte('creado_en', vStartDate.toISOString())
        .lte('creado_en', vEndDate.toISOString())
        .order('creado_en', { ascending: false })
      if (!mostrarArchivados) paysQuery = (paysQuery as any).eq('archivado', false)
      const { data } = await paysQuery
      if (data) setVentasPayments(data)
    }
    loadVentasData()
  }, [vStartDate, vEndDate, activeTab, mostrarArchivados])

  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.maneja_inventario && (p.stock_actual ?? 0) <= (p.stock_minimo ?? 5))
  }, [products])

  const topProductsSortedByAmount = useMemo(() => {
    return [...topProducts].sort((a, b) => b.cant - a.cant).slice(0, 10)
  }, [topProducts])

  const sortedTopProducts = useMemo(() => {
    return [...topProducts].sort((a, b) => topProductSort === 'cantidad' ? b.cant - a.cant : b.total - a.total).slice(0, 10)
  }, [topProducts, topProductSort])

  useEffect(() => {
    setNotaDiaText(notaDia?.contenido || '')
  }, [notaDia])

  // --- MODALS STATE ---
  const [isMetasModalOpen, setMetasModalOpen] = useState(false)
  const [isProductModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [removeCurrentPhoto, setRemoveCurrentPhoto] = useState(false)

  // Product extras state
  const [productExtras, setProductExtras] = useState<any[]>([])
  const [loadingExtras, setLoadingExtras] = useState(false)
  const [newExtraName, setNewExtraName] = useState('')
  const [newExtraPrice, setNewExtraPrice] = useState('0')
  const [newExtraEsVariante, setNewExtraEsVariante] = useState(false)
  const [addingExtra, setAddingExtra] = useState(false)

  // Category modal
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState({ nombre: '', orden: '0' })
  const [savingCategory, setSavingCategory] = useState(false)
  // Merge categories
  const [mergeOriginIds, setMergeOriginIds] = useState<string[]>([])
  const [mergeDestinationId, setMergeDestinationId] = useState<string>('')
  const [mergingCategories, setMergingCategories] = useState(false)

  // Price history
  const [priceHistory, setPriceHistory] = useState<any[]>([])
  const [loadingPriceHistory, setLoadingPriceHistory] = useState(false)

  const loadPriceHistory = async (productId: string) => {
    setLoadingPriceHistory(true)
    const { data } = await supabase.from('product_price_history')
      .select('*, cambiado_por:employees(nombre)')
      .eq('producto_id', productId)
      .order('creado_en', { ascending: false })
      .limit(10)
    setPriceHistory(data || [])
    setLoadingPriceHistory(false)
  }

  const loadProductExtras = async (productId: string) => {
    setLoadingExtras(true)
    const { data } = await supabase
      .from('product_extras')
      .select('*')
      .eq('producto_id', productId)
      .order('es_variante_unica', { ascending: false })
      .order('nombre')
    setProductExtras(data || [])
    setLoadingExtras(false)
  }

  const handleAddExtra = async () => {
    if (!editingProduct || !newExtraName.trim()) return
    setAddingExtra(true)
    const { error } = await supabase.from('product_extras').insert({
      producto_id: editingProduct.id,
      nombre: newExtraName.trim(),
      precio_adicional: parseFloat(newExtraPrice) || 0,
      es_variante_unica: newExtraEsVariante,
      activo: true,
    })
    setAddingExtra(false)
    if (error) return alert('Error al agregar extra: ' + error.message)
    setNewExtraName('')
    setNewExtraPrice('0')
    setNewExtraEsVariante(false)
    loadProductExtras(editingProduct.id)
  }

  const handleDeleteExtra = async (extraId: string) => {
    if (!editingProduct) return
    const { error } = await supabase.from('product_extras').delete().eq('id', extraId)
    if (error) return alert('Error al eliminar extra: ' + error.message)
    loadProductExtras(editingProduct.id)
  }
  
  const [isEmployeeModalOpen, setEmployeeModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)

  const [isTableModalOpen, setTableModalOpen] = useState(false)
  const [tableNumber, setTableNumber] = useState('')

  // Confirmation Modals State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean,
    title: string,
    message: string,
    variant: 'primary' | 'danger',
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    onConfirm: () => {}
  })

  const openConfirm = (title: string, message: string, onConfirm: () => void, variant: 'primary' | 'danger' = 'danger') => {
    setConfirmModal({ isOpen: true, title, message, variant, onConfirm })
  }

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }))

  // --- Exports and Downloads ---
  const exportToExcel = async () => {
    const XLSX = await import('xlsx')
    const data = [
      ...payments.map(p => ({
        Fecha: new Date(p.creado_en).toLocaleString(),
        'Concepto/Producto': `Venta Ticket #${p.order_id?.substring(0,8).toUpperCase()}`,
        Tipo: 'Venta',
        'Método de Pago': p.metodo,
        Monto: p.monto_cobrado
      })),
      ...movements.map(m => ({
        Fecha: new Date(m.fecha).toLocaleString(),
        'Concepto/Producto': m.descripcion || (m.tipo === 'ingreso' ? 'Ingreso Manual' : 'Egreso Manual'),
        Tipo: m.tipo === 'ingreso' ? 'Ingreso Manual' : 'Egreso',
        'Método de Pago': m.metodo || 'efectivo',
        Monto: m.tipo === 'egreso' ? -m.monto : m.monto
      }))
    ]
    
    // Sort descending by date
    data.sort((a, b) => new Date(b.Fecha).getTime() - new Date(a.Fecha).getTime())
    
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Transacciones")
    XLSX.writeFile(wb, `Reporte_Financiero_Cristis_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
  }

  /** Export only the currently selected month's data (including archived) for backup before deletion. */
  const exportMonthToExcel = async () => {
    const startStr = startDate.toISOString()
    const endStr   = endDate.toISOString()
    const monthLabel = format(startDate, 'MMMM_yyyy', { locale: es })

    const [{ data: mPays }, { data: mMovs }] = await Promise.all([
      supabase.from('payments')
        .select('creado_en, order_id, monto_cobrado, metodo, anulado')
        .gte('creado_en', startStr)
        .lte('creado_en', endStr)
        .order('creado_en'),
      supabase.from('movements')
        .select('fecha, descripcion, tipo, monto, metodo')
        .gte('fecha', startStr)
        .lte('fecha', endStr)
        .order('fecha')
    ])

    const payRows = (mPays || []).map(p => ({
      Fecha: new Date(p.creado_en).toLocaleString(),
      Ticket: `#${p.order_id?.substring(0,8).toUpperCase()}`,
      Tipo: 'Venta',
      Método: p.metodo,
      Monto: p.monto_cobrado,
      Anulado: p.anulado ? 'Sí' : 'No',
    }))

    const movRows = (mMovs || []).map(m => ({
      Fecha: new Date(m.fecha).toLocaleString(),
      Ticket: '',
      Tipo: m.tipo === 'ingreso' ? 'Ingreso Manual' : 'Egreso',
      Método: m.metodo || 'efectivo',
      Monto: m.tipo === 'egreso' ? -m.monto : m.monto,
      Anulado: 'No',
    }))

    const all = [...payRows, ...movRows].sort(
      (a, b) => new Date(a.Fecha).getTime() - new Date(b.Fecha).getTime()
    )

    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), 'Transacciones')
    XLSX.writeFile(wb, `Respaldo_${monthLabel}_Cristis_${format(new Date(), 'yyyyMMdd')}.xlsx`)

    setExportedMonth(true)
  }

  const handleArchivarMes = () => {
    const inicioMes = startOfMonth(currentDate)
    const finMes = endOfMonth(currentDate)
    if (finMes >= new Date()) {
      alert('❌ No se puede archivar un mes que aún no ha terminado.')
      return
    }
    const label = format(inicioMes, "MMMM yyyy", { locale: es })
    
    openConfirm(
      `📦 Archivar ${label}`,
      `¿Archivar todos los registros de ${label}? Los datos NO se eliminan — solo se ocultarán de las vistas normales. Puedes verlos de nuevo en cualquier momento activando "Mostrar meses archivados".`,
      async () => {
        closeConfirm()
        setArchivandoMes(true)
        const { error } = await supabase.rpc('archivar_mes', {
          p_start: inicioMes.toISOString(),
          p_end:   finMes.toISOString(),
        })
        setArchivandoMes(false)
        if (error) {
          alert('Error al archivar: ' + error.message)
        } else {
          alert(`✅ ${label} archivado correctamente. Ya no aparecerá en las vistas normales.`)
          loadData()
        }
      },
      'primary'
    )
  }

  const handleDesarchivarMes = () => {
    const inicioMes = startOfMonth(currentDate)
    const finMes = endOfMonth(currentDate)
    const label = format(inicioMes, "MMMM yyyy", { locale: es })
    
    openConfirm(
      `📦 Desarchivar ${label}`,
      `¿Desarchivar todos los registros de ${label}? Volverán a aparecer en las vistas normales de la aplicación.`,
      async () => {
        closeConfirm()
        setDesarchivandoMes(true)
        const { error } = await supabase.rpc('desarchivar_mes', {
          p_start: inicioMes.toISOString(),
          p_end:   finMes.toISOString(),
        })
        setDesarchivandoMes(false)
        if (error) {
          alert('Error al desarchivar: ' + error.message)
        } else {
          alert(`✅ ${label} desarchivado correctamente.`)
          loadData()
        }
      },
      'primary'
    )
  }

  const handleBorrarMesPermanente = async () => {
    if (deleteConfirmText.trim() !== 'ELIMINAR') return
    if (!exportedMonth) return
    const inicioMes = startOfMonth(currentDate)
    const finMes = endOfMonth(currentDate)
    const label = format(inicioMes, "MMMM yyyy", { locale: es })
    openConfirm(
      `🗑 BORRADO PERMANENTE — ${label}`,
      `¿BORRAR PERMANENTEMENTE todos los registros de ${label}? Esta acción NO SE PUEDE DESHACER. Los datos desaparecerán para siempre.`,
      async () => {
        closeConfirm()
        setDeletingMonth(true)
        const { data, error } = await supabase.rpc('borrar_mes_permanente', {
          p_start: inicioMes.toISOString(),
          p_end:   finMes.toISOString(),
        })
        setDeletingMonth(false)
        if (error) {
          alert('Error al borrar: ' + error.message)
        } else {
          const r = data as any
          alert(`✅ Borrado completado:\n• ${r?.orders ?? 0} órdenes\n• ${r?.order_items ?? 0} items\n• ${r?.payments ?? 0} pagos\n• ${r?.movements ?? 0} movimientos`)
          setDeleteConfirmText('')
          setExportedMonth(false)
          loadData()
        }
      },
      'danger'
    )
  }


  const downloadFullBackup = async () => {
    try {
      // Import xlsx dynamically just in case it's not imported at the top
      const XLSX = await import('xlsx')
      alert('Recopilando datos para el respaldo, por favor espera...')
      
      const [
        { data: allProducts },
        { data: allOrders },
        { data: allPayments },
        { data: allMovements },
        { data: allEmployees },
        { data: allTables }
      ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('orders').select('*'),
        supabase.from('payments').select('*'),
        supabase.from('movements').select('*'),
        supabase.from('employees').select('id, nombre, rol, activo, creado_en'),
        supabase.from('tables').select('*')
      ])

      const wb = XLSX.utils.book_new()

      const pData = allProducts?.map(p => ({ ID: p.id, Nombre: p.nombre, Precio: p.precio, CategoriaID: p.categoria_id, Activo: p.activo })) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pData), "Productos")

      const oData = allOrders?.map(o => ({ ID: o.id, Tipo: o.tipo, MesaID: o.table_id, Cliente: o.nombre_cliente, Estado: o.estado, Creado: o.creado_en })) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oData), "Pedidos")

      const payData = allPayments?.map(p => ({ ID: p.id, PedidoID: p.order_id, Monto: p.monto_cobrado, Metodo: p.metodo, Anulado: p.anulado, Creado: p.creado_en })) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payData), "Ventas")

      const mData = allMovements?.map(m => ({ ID: m.id, Tipo: m.tipo, Monto: m.monto, Descripcion: m.descripcion, Fecha: m.fecha })) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mData), "Movimientos")

      const eData = allEmployees?.map(e => ({ ID: e.id, Nombre: e.nombre, Rol: e.rol, Activo: e.activo, Creado: e.creado_en })) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eData), "Empleados")

      const tData = allTables?.map(t => ({ ID: t.id, Numero: t.numero, Estado: t.estado })) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tData), "Mesas")

      XLSX.writeFile(wb, `Respaldo_Completo_Cristis_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`)
    } catch (e: any) {
      alert('Error generando respaldo: ' + e.message)
    }
  }

  const downloadTicketPDF = async (payment: any) => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: [80, 200] })
    doc.setFont('courier', 'normal')
    doc.setFontSize(10)
    
    let y = 10
    doc.text(settings?.negocio_nombre || "Cristi's Coffe & Snack", 40, y, { align: 'center' }); y += 5;
    doc.setFontSize(8);
    if (settings?.negocio_direccion) {
      doc.text(settings.negocio_direccion, 40, y, { align: 'center' }); y += 4;
    }
    if (settings?.negocio_telefono) {
      doc.text(`Tel: ${settings.negocio_telefono}`, 40, y, { align: 'center' }); y += 4;
    }
    y += 6;
    
    doc.setFontSize(10)
    doc.text(`Ticket: #${payment.order_id?.substring(0,8).toUpperCase()}`, 5, y); y += 5;
    doc.text(`Fecha: ${new Date(payment.creado_en).toLocaleString()}`, 5, y); y += 10;
    doc.text("-".repeat(32), 5, y); y += 5;
    
    payment.order?.order_items?.forEach((item: any) => {
      if (item.cancelado) return;
      const totalItem = (item.precio_unitario || 0) * item.cantidad
      doc.text(`${item.cantidad}x ${item.product?.nombre} $${totalItem.toFixed(2)}`, 5, y); y += 5;
      
      if (item.nombre_variante) {
        doc.text(`  ◆ ${item.nombre_variante}`, 5, y); y += 5;
      }
      
      const extras = item.order_item_extras || []
      extras.forEach((ex: any) => {
        doc.text(`  + ${ex.nombre_extra} $${(ex.precio_adicional * item.cantidad).toFixed(2)}`, 5, y); y += 5;
      })
      
      if (item.notas) {
        doc.setFont('courier', 'italic')
        doc.text(`  Nota: ${item.notas}`, 5, y); y += 5;
        doc.setFont('courier', 'normal')
      }
    })
    
    doc.text("-".repeat(32), 5, y); y += 5;
    doc.text(`Total: $${payment.monto_cobrado.toFixed(2)}`, 75, y, { align: 'right' }); y += 5;
    doc.text(`Pagado con: ${payment.metodo?.toUpperCase()}`, 75, y, { align: 'right' }); y += 10;
    
    if (settings?.ticket_linea_extra) {
      doc.setFontSize(8);
      doc.text(settings.ticket_linea_extra, 40, y, { align: 'center' }); y += 5;
      doc.setFontSize(10);
    }
    const farewell = settings?.ticket_mensaje_despedida || "¡Gracias por su compra!";
    doc.text(farewell, 40, y, { align: 'center' });
    
    doc.save(`Ticket_${payment.order_id?.substring(0,8).toUpperCase()}.pdf`)
  }

  // --- Handlers ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    const file = formData.get('foto') as File
    
    let foto_url = editingProduct?.foto_url

    if (removeCurrentPhoto && !(file && file.size > 0)) {
      if (editingProduct?.foto_url) {
        const oldPath = editingProduct.foto_url.split('/').pop()
        if (oldPath) await supabase.storage.from('productos').remove([oldPath])
      }
      foto_url = null
    }

    if (file && file.size > 0) {
      try {
        const imageCompression = (await import('browser-image-compression')).default
        const compressed = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 800,
          useWebWorker: true,
          fileType: 'image/webp'
        })
        
        const fileName = `prod_${Date.now()}.webp`
        const { data: uploadData, error: upError } = await supabase.storage.from('productos').upload(fileName, compressed, {
          cacheControl: '604800',
          contentType: compressed.type,
          upsert: true
        })

        if (upError) throw upError
        
        const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(fileName)
        foto_url = publicUrl

        if (editingProduct?.foto_url) {
          const oldPath = editingProduct.foto_url.split('/').pop()
          if (oldPath) await supabase.storage.from('productos').remove([oldPath])
        }
      } catch (err) {
        console.error(err)
        alert("Error procesando imagen")
        return
      }
    }

    const pData: any = {
      nombre: formData.get('nombre'),
      precio: parseFloat(formData.get('precio') as string),
      categoria: formData.get('categoria'),
      categoria_id: formData.get('categoria_id') || null,
      activo: formData.get('activo') === 'true',
      turno: formData.get('turno'),
      foto_url,
      maneja_inventario: formData.get('maneja_inventario') === 'true',
      stock_actual: formData.get('maneja_inventario') === 'true' 
        ? (formData.get('stock_actual') ? parseInt(formData.get('stock_actual') as string) : 0)
        : null,
      stock_minimo: formData.get('maneja_inventario') === 'true' && formData.get('stock_minimo')
        ? parseInt(formData.get('stock_minimo') as string)
        : 5,
    }

    if (editingProduct) {
      // Track price change
      const newPrecio = parseFloat(formData.get('precio') as string)
      if (editingProduct.precio !== newPrecio) {
        await supabase.from('product_price_history').insert({
          producto_id: editingProduct.id,
          precio_anterior: editingProduct.precio,
          precio_nuevo: newPrecio,
          cambiado_por: currentUser
        })
      }
      const { error } = await supabase.from('products').update(pData).eq('id', editingProduct.id)
      if (error) return alert("Error actualizando: " + error.message)
    } else {
      const { error } = await supabase.from('products').insert(pData)
      if (error) return alert("Error creando: " + error.message)
    }

    setProductModalOpen(false)
    loadData()
  }

  const handleDeleteProduct = async (p: any) => {
    openConfirm(
      "Eliminar Producto",
      `¿Borrar ${p.nombre} definitivamente?`,
      async () => {
        closeConfirm()
        
        // 1. Borrar la foto de Storage si existe
        if (p.foto_url) {
          const oldPath = p.foto_url.split('/').pop()
          if (oldPath) await supabase.storage.from('productos').remove([oldPath])
        }
        
        // 2. Borrar de la base de datos
        const { error } = await supabase.from('products').delete().eq('id', p.id)
        if (error) {
          alert("Error al eliminar el producto: " + error.message)
          return
        }
        
        loadData()
      }
    )
  }

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    const nombre = formData.get('nombre') as string
    const pin = formData.get('pin') as string
    const rol = formData.get('rol') as string
    const activo = formData.get('activo') === 'true'

    if (pin.length !== 4) return alert("El PIN debe tener 4 dígitos")

    let res;
    if (editingEmployee) {
      res = await updateEmployee(editingEmployee.id, nombre, pin, rol, activo)
    } else {
      res = await createEmployee(nombre, pin, rol)
    }

    if (res?.error) alert(res.error)
    else {
      setEmployeeModalOpen(false)
      loadData()
    }
  }

  const handleDeleteEmployee = async (emp: any) => {
    openConfirm(
      "Eliminar Empleado",
      `¿Eliminar a ${emp.nombre} definitivamente? Esta acción no se puede deshacer.`,
      async () => {
        closeConfirm()
        if (!currentUser) return;
        
        const res = await deleteEmployee(emp.id, currentUser)
        
        if (res?.error === 'HAS_HISTORY') {
          setTimeout(() => {
            openConfirm(
              "Historial Detectado",
              `${emp.nombre} ya tiene pedidos o movimientos registrados, así que no se puede eliminar sin perder trazabilidad del historial de ventas. ¿Deseas desactivarlo en su lugar? (dejará de poder iniciar sesión, pero su historial se conserva)`,
              async () => {
                closeConfirm()
                await updateEmployee(emp.id, emp.nombre, emp.pin, emp.rol, false)
                loadData()
              },
              "primary"
            )
          }, 300) // Small delay to allow the first modal to close cleanly
        } else if (res?.error) {
          alert(res.error)
        } else {
          loadData()
        }
      }
    )
  }

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tableNumber) {
      const { error } = await supabase.from('tables').insert({ numero: tableNumber })
      if (error) {
        alert('Error guardando mesa: ' + error.message)
      } else {
        setTableModalOpen(false)
        setTableNumber('')
        loadData()
      }
    }
  }

  const handleDeleteTable = async (table: any) => {
    if (table.estado === 'ocupada') {
      alert(`No se puede eliminar la Mesa ${table.numero} porque actualmente está ocupada. Cierra o mueve el pedido activo primero.`)
      return
    }
    openConfirm(
      "Eliminar Mesa",
      "¿Borrar esta mesa definitivamente?",
      async () => {
        closeConfirm()
        const { error } = await supabase.from('tables').delete().eq('id', table.id)
        if (error) {
          alert('Error eliminando mesa: ' + error.message)
        } else {
          loadData()
        }
      }
    )
  }

  const handleDetectPrinters = async () => {
    setDetectingPrinters(true)
    setPrinterDetectError(null)
    try {
      const p = await detectarImpresoras()
      setDetectedPrinters(p)
      if (p.length === 0) setPrinterDetectError('No se encontraron impresoras en QZ Tray.')
    } catch (err: any) {
      setPrinterDetectError('No se pudo conectar con QZ Tray — asegúrate de que esté abierto e inténtalo de nuevo')
    } finally {
      setDetectingPrinters(false)
    }
  }

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSelectLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImageToCrop(url)
    setCropModalOpen(true)
    // reset input
    e.target.value = ''
  }

  const handleEditExistingLogo = async () => {
    if (!ticketPreview.logoUrl) return
    try {
      setLogoUploading(true)
      // fetch as blob to avoid cors tainting
      const res = await fetch(ticketPreview.logoUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setImageToCrop(url)
      setCropModalOpen(true)
    } catch (e) {
      alert("No se pudo cargar la imagen para editar.")
    } finally {
      setLogoUploading(false)
    }
  }

  const handleConfirmCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return
    setCropModalOpen(false)
    setLogoUploading(true)
    try {
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels)
      const file = new File([croppedBlob], "cropped.jpg", { type: "image/jpeg" })

      const { default: imageCompression } = await import('browser-image-compression')
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 600,
        useWebWorker: true,
        fileType: 'image/webp'
      })
      const fileName = `logo_ticket_${Date.now()}.webp`
      const { error: upError } = await supabase.storage.from('productos').upload(fileName, compressed, {
        cacheControl: '604800',
        contentType: compressed.type,
        upsert: true
      })
      if (upError) throw upError
      const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(fileName)
      
      setTicketPreview(p => ({ ...p, logoUrl: publicUrl }))
      // Save immediately to DB
      await supabase.from('settings').update({ ticket_logo_url: publicUrl }).eq('id', 1)
      alert('Logo actualizado correctamente')
    } catch (err: any) {
      alert('Error subiendo logo recortado: ' + err.message)
    } finally {
      setLogoUploading(false)
    }
  }

  const handleRestoreDefaultLogo = async () => {
    await supabase.from('settings').update({ ticket_logo_url: null }).eq('id', 1)
    setTicketPreview(p => ({ ...p, logoUrl: '' }))
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    const sData = {
      impresora_activa: formData.get('impresora_activa') === 'true',
      impresora_modo: formData.get('impresora_modo'),
      impresora_papel_mm: formData.get('impresora_papel_mm') || '80',
      impresora_ip: formData.get('impresora_ip') || null,
      nombre_impresora_windows: formData.get('nombre_impresora_windows') || null,

      impresora_cocina_activa: formData.get('impresora_cocina_activa') === 'true',
      impresora_cocina_modo: formData.get('impresora_cocina_modo'),
      impresora_cocina_ip: formData.get('impresora_cocina_ip') || null,
      impresora_cocina_qz_nombre: formData.get('impresora_cocina_qz_nombre') || null,

      ticket_tamano_fuente: formData.get('ticket_tamano_fuente') || 'normal',
      ticket_mensaje_despedida: formData.get('ticket_mensaje_despedida') || '¡Gracias por su compra! Vuelva pronto.',
      ticket_mostrar_atendido_por: formData.get('ticket_mostrar_atendido_por') === 'on',
      ticket_mostrar_logo: formData.get('ticket_mostrar_logo') === 'on',
      negocio_nombre: formData.get('negocio_nombre') ?? "Cristi's Coffe & Snack",
      negocio_direccion: formData.get('negocio_direccion') ?? null,
      negocio_telefono: formData.get('negocio_telefono') ?? null,
      negocio_rfc: formData.get('negocio_rfc') ?? null,
      ticket_linea_extra: formData.get('ticket_linea_extra') ?? null,
      meta_diaria: parseFloat(formData.get('meta_diaria') as string) || 0,
      meta_semanal: parseFloat(formData.get('meta_semanal') as string) || 0,
      meta_mensual: parseFloat(formData.get('meta_mensual') as string) || 0,
    }
    const { error } = await supabase.from('settings').update(sData).eq('id', 1)
    if (error) {
      alert('Error guardando configuraci\u00f3n: ' + error.message)
    } else {
      alert('Configuraci\u00f3n guardada exitosamente')
      loadData()
    }
  }

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)
    const { error } = await supabase.from('movements').insert({
      tipo: formData.get('tipo'),
      monto: parseFloat(formData.get('monto') as string),
      descripcion: formData.get('descripcion'),
      metodo: formData.get('metodo'),
      creado_por: currentUser
    })
    
    if (error) {
      alert("Error guardando movimiento: " + error.message)
    } else {
      alert("Movimiento registrado")
      ;(e.target as HTMLFormElement).reset()
      loadData()
    }
  }

  return (
    <>
    <div className="flex flex-col md:flex-row min-h-[100dvh] md:min-h-0 md:h-full bg-white md:rounded-xl shadow-sm md:border border-[var(--color-gris)]/20 md:overflow-hidden relative">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex w-64 bg-[var(--color-crema)] border-r border-[var(--color-bronce)]/20 flex-col">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-3 px-6 py-4 font-bold tracking-wider uppercase text-sm transition-colors ${
                isActive ? 'bg-[var(--color-bronce)] text-white' : 'text-[var(--color-gris)] hover:bg-[var(--color-bronce)]/10 hover:text-[var(--color-bronce)]'
              }`}
            >
              <Icon size={18} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Content Area */}
        <div className="flex-1 overflow-y-visible md:overflow-y-auto bg-gray-50/30 p-4 md:p-6 pb-28 md:pb-6 custom-scrollbar flex flex-col">
          {loadError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg shadow-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <XCircle className="text-red-500 h-5 w-5" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error al cargar datos del dashboard</h3>
                  <div className="mt-1 text-sm text-red-700">
                    <p>{loadError}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Dashboard Tabs */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Dashboard Financiero</h2>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-gris)] cursor-pointer bg-white px-3 h-9 rounded-lg border border-[var(--color-gris)]/20 shadow-sm hover:bg-gray-50 transition-colors mr-2">
                  <input 
                    type="checkbox" 
                    className="accent-[var(--color-bronce)] w-4 h-4" 
                    checked={mostrarArchivados} 
                    onChange={e => setMostrarArchivados(e.target.checked)} 
                  />
                  Mostrar archivados
                </label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={exportToExcel}
                  className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800 mr-2 h-9"
                >
                  <FileSpreadsheet size={16} className="mr-2" /> Exportar a Excel
                </Button>
                {/* Archive button — disabled/hidden for current/future months */}
                {mesArchivado === false && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-[var(--color-bronce)] text-[var(--color-bronce)] hover:bg-[var(--color-crema)] hover:text-[var(--color-bronce)] font-semibold disabled:opacity-50"
                    onClick={handleArchivarMes}
                    disabled={archivandoMes || endOfMonth(currentDate) >= new Date()}
                    title={endOfMonth(currentDate) >= new Date() ? "No se puede archivar un mes que aún no ha terminado." : ""}
                  >
                    📦 {archivandoMes ? 'Archivando...' : `Archivar ${format(currentDate, 'MMMM', { locale: es })}`}
                  </Button>
                )}
                {mesArchivado === true && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-3 h-9 rounded-lg">
                      📦 MES ARCHIVADO
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-amber-600 text-amber-700 hover:bg-amber-50 font-semibold"
                      onClick={handleDesarchivarMes}
                      disabled={desarchivandoMes}
                    >
                      {desarchivandoMes ? 'Desarchivando...' : 'Desarchivar mes'}
                    </Button>
                  </div>
                )}
                <select 
                  className="bg-transparent text-[var(--color-bronce)] font-semibold outline-none cursor-pointer pr-2"
                  value={dashboardPeriod}
                  onChange={(e: any) => setDashboardPeriod(e.target.value)}
                >
                  <option value="dia">Día</option>
                  <option value="semana">Semana</option>
                  <option value="mes">Mes</option>
                </select>
                <div className="flex items-center h-9 bg-white rounded-lg border border-[var(--color-gris)]/20 shadow-sm overflow-hidden">
                  <button onClick={() => navigatePeriod(-1)} className="p-2 hover:bg-gray-50 text-[var(--color-gris)] hover:text-[var(--color-bronce)] transition-colors border-r border-[var(--color-gris)]/10 h-full flex items-center">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-4 text-sm font-bold text-[var(--color-negro)] min-w-[140px] text-center capitalize flex items-center justify-center h-full">
                    {formatPeriodTitle()}
                  </div>
                  <button onClick={() => navigatePeriod(1)} className="p-2 hover:bg-gray-50 text-[var(--color-gris)] hover:text-[var(--color-bronce)] transition-colors border-l border-[var(--color-gris)]/10 h-full flex items-center">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>


            {/* Sub-tabs for Dashboard */}
            <div className="flex border-b border-[var(--color-gris)]/20 mb-6 gap-6 overflow-x-auto whitespace-nowrap">
              {[
                { id: 'resumen', label: 'Resumen' },
                { id: 'top_productos', label: 'Top Productos' },
                { id: 'empleados', label: 'Empleados' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setDashboardTab(t.id as any)}
                  className={`pb-3 text-sm font-bold tracking-wider uppercase transition-colors ${
                    dashboardTab === t.id
                      ? 'border-b-2 border-[var(--color-bronce)] text-[var(--color-bronce)]'
                      : 'text-[var(--color-gris)] hover:text-[var(--color-negro)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {dashboardTab === 'resumen' && (
              <>
                {/* Unreviewed movements alert */}
                {movements.some(m => !m.revisado_por_admin && m.tipo === 'egreso') && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                      🔔 {movements.filter(m => !m.revisado_por_admin && m.tipo === 'egreso').length} gastos nuevos registrados por empleados pendientes de revisión
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="bg-white border-red-200 text-red-700 hover:bg-red-100 h-8 text-xs"
                      onClick={async () => {
                        const unreviewed = movements.filter(m => !m.revisado_por_admin && m.tipo === 'egreso').map(m => m.id)
                        await supabase.from('movements').update({ revisado_por_admin: true }).in('id', unreviewed)
                        loadData()
                      }}
                    >
                      Marcar revisados
                    </Button>
                  </div>
                )}

                {/* Nota del día */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 shadow-sm mb-6">
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between font-bold text-yellow-800 text-sm tracking-wider uppercase list-none">
                      <span className="flex items-center gap-2">
                        📝 Nota del Día 
                        <span className="text-xs font-normal normal-case">({format(startDate, 'dd MMM yyyy')})</span>
                        {notaDia?.contenido && <span className="ml-2 text-green-600">✓</span>}
                      </span>
                      <span className="transition group-open:rotate-180">
                        <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                      </span>
                    </summary>
                    <div className="mt-4">
                      <textarea
                        className="w-full h-24 p-3 bg-white border border-yellow-300 rounded-lg text-sm text-[var(--color-negro)] placeholder-yellow-400 outline-none focus:border-yellow-500"
                        placeholder="Escribe alguna nota importante de este día (ej. clima, evento en la calle, etc.)..."
                        value={notaDiaText}
                        onChange={(e) => setNotaDiaText(e.target.value)}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          disabled={savingNota}
                          onClick={async () => {
                            setSavingNota(true)
                            const dateStr = format(startDate, 'yyyy-MM-dd')
                            if (notaDia) {
                              await supabase.from('notas_diarias').update({ contenido: notaDiaText }).eq('id', notaDia.id)
                            } else {
                              const { data } = await supabase.from('notas_diarias').insert({
                                fecha: dateStr,
                                contenido: notaDiaText,
                                creado_por: currentUser
                              }).select().single()
                              if (data) setNotaDia(data)
                            }
                            setSavingNota(false)
                            alert('Nota guardada')
                          }}
                        >
                          {savingNota ? 'Guardando...' : 'Guardar Nota'}
                        </Button>
                      </div>
                    </div>
                  </details>
                </div>

                {mesArchivado && !mostrarArchivados && metrics.efectivo === 0 && metrics.tarjeta === 0 && metrics.ingresosManuales === 0 && metrics.egresosManuales === 0 && topProducts.length === 0 && (
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-r-lg shadow-sm">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <span className="text-amber-500 text-xl">📦</span>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-amber-800">Mes archivado oculto</h3>
                        <div className="mt-1 text-sm text-amber-700">
                          <p>Este mes tiene registros archivados que no se están mostrando. Activa <strong>Mostrar meses archivados</strong> en la barra superior para verlos.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">

                  {/* ── Efectivo ── */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 border-l-4 border-l-[var(--color-bronce)] shadow-sm flex items-start gap-3 min-h-[110px]">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--color-bronce)] flex items-center justify-center text-white text-lg">
                      💵
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest mb-1">Efectivo</div>
                      <div className="text-xl font-bold text-[var(--color-negro)] leading-tight tracking-tight">${metrics.efectivo.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                      <div className="text-xs text-[var(--color-gris)] mt-0.5">Ventas en efectivo</div>
                    </div>
                  </div>

                  {/* ── Tarjeta ── */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 border-l-4 border-l-blue-500 shadow-sm flex items-start gap-3 min-h-[110px]">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white text-lg">
                      💳
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest mb-1">Tarjeta</div>
                      <div className="text-xl font-bold text-[var(--color-negro)] leading-tight tracking-tight">${metrics.tarjeta.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                      <div className="text-xs text-[var(--color-gris)] mt-0.5">Ventas con tarjeta</div>
                    </div>
                  </div>

                  {/* ── Balance Neto ── */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 border-l-4 border-l-green-500 shadow-sm flex items-start gap-3 min-h-[110px]">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center text-white text-lg">
                      ✅
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest mb-1">Balance Neto</div>
                      <div className="text-xl font-bold text-green-700 leading-tight tracking-tight">
                        ${(metrics.efectivo + metrics.tarjeta + metrics.ingresosManuales - metrics.egresosManuales).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </div>
                      <div className="text-xs text-[var(--color-gris)] mt-0.5 flex justify-between items-center flex-wrap gap-1">
                        <span>Ventas + ing − egr</span>
                        {(() => {
                          const currentNeto = metrics.efectivo + metrics.tarjeta + metrics.ingresosManuales - metrics.egresosManuales
                          if (prevMetrics.neto === 0) return null
                          const change = ((currentNeto - prevMetrics.neto) / prevMetrics.neto) * 100
                          const isUp = change >= 0
                          return (
                            <span className={`font-bold text-[10px] ${isUp ? 'text-green-700' : 'text-red-600'}`}>
                              {isUp ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                            </span>
                          )
                        })()}
                      </div>
                      {settings && (
                        <div className="mt-2 w-full bg-green-100 rounded-full h-1.5">
                          {(() => {
                            const currentNeto = metrics.efectivo + metrics.tarjeta + metrics.ingresosManuales - metrics.egresosManuales
                            const meta = dashboardPeriod === 'dia' ? settings.meta_diaria : dashboardPeriod === 'semana' ? settings.meta_semanal : settings.meta_mensual
                            if (!meta || meta <= 0) return <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '0%' }}></div>
                            const pct = Math.min(100, Math.max(0, (currentNeto / meta) * 100))
                            return <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                          })()}
                        </div>
                      )}
                      {settings && (dashboardPeriod === 'dia' ? settings.meta_diaria : dashboardPeriod === 'semana' ? settings.meta_semanal : settings.meta_mensual) > 0 && (
                        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-white/50 rounded-xl border border-[var(--color-gris)]/10">
                          <span className="text-xs font-bold text-[var(--color-gris)] tracking-wider">META: ${(dashboardPeriod === 'dia' ? settings.meta_diaria : dashboardPeriod === 'semana' ? settings.meta_semanal : settings.meta_mensual).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          <button onClick={() => setMetasModalOpen(true)} className="hover:opacity-70 p-0.5" title="Editar metas">✏️</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Egresos ── */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 border-l-4 border-l-red-500 shadow-sm flex items-start gap-3 min-h-[110px]">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center text-white text-lg">
                      🔴
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest mb-1">Egresos</div>
                      <div className="text-xl font-bold text-[var(--color-negro)] leading-tight tracking-tight">${metrics.egresosManuales.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                      <div className="text-xs text-[var(--color-gris)] mt-0.5">Salidas manuales</div>
                    </div>
                  </div>

                  {/* ── Cancelaciones ── */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 border-l-4 border-l-orange-500 shadow-sm flex items-start gap-3 min-h-[110px]">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white text-lg">
                      ⚠️
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest mb-1">Cancelaciones</div>
                      <div className="text-xl font-bold text-[var(--color-negro)] leading-tight tracking-tight">{metrics.cancelaciones}</div>
                      <div className="text-xs text-[var(--color-gris)] mt-0.5">Items anulados</div>
                    </div>
                  </div>

                  {/* ── Stock Bajo ── */}
                  <div 
                    className="bg-white p-4 rounded-xl border border-gray-200 border-l-4 border-l-red-500 shadow-sm flex items-start gap-3 min-h-[110px] relative group cursor-pointer md:cursor-help"
                    onClick={(e) => {
                      if (window.innerWidth < 768) {
                        const tooltip = e.currentTarget.querySelector('.tooltip-content');
                        if (tooltip) tooltip.classList.toggle('hidden');
                      }
                    }}
                  >
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center text-white text-lg">
                      📦
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-[var(--color-gris)] uppercase tracking-widest mb-1">Stock Bajo</div>
                      <div className="text-xl font-bold text-[var(--color-negro)] leading-tight tracking-tight">{lowStockProducts.length}</div>
                      <div className="text-xs text-[var(--color-gris)] mt-0.5">Productos a reabastecer</div>
                    </div>
                    <div className="tooltip-content absolute hidden group-hover:block top-full mt-2 left-0 w-64 bg-white border border-gray-200 shadow-xl rounded-lg p-3 z-50 text-xs text-[var(--color-negro)] max-h-48 overflow-y-auto">
                      <div className="font-bold border-b pb-1 mb-2">Productos por agotarse:</div>
                      {lowStockProducts.length === 0 ? (
                        <div className="text-gray-500 italic">No hay productos con stock bajo.</div>
                      ) : (
                        lowStockProducts.map(p => (
                          <div key={p.id} className="flex justify-between py-1">
                            <span className="truncate pr-2">{p.nombre}</span>
                            <span className="font-bold text-red-600">{p.stock_actual} / {p.stock_minimo ?? 5}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

                {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
              {/* Bar chart: Ingresos vs Egresos */}
              <div className="md:col-span-2 bg-white p-5 rounded-xl border border-[var(--color-gris)]/20 shadow-sm">
                <div className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-4">Ingresos vs Egresos del período</div>
                <ResponsiveContainer width="100%" height={200}>
                  {(() => {
                    const barData = [
                      { name: 'Efectivo', monto: metrics.efectivo, color: '#16a34a' },
                      { name: 'Tarjeta', monto: metrics.tarjeta, color: '#0284c7' },
                      { name: 'Ing. Manual', monto: metrics.ingresosManuales, color: '#d97706' },
                      { name: 'Egresos', monto: metrics.egresosManuales, color: '#dc2626' },
                    ]
                    return (
                      <BarChart data={barData} barSize={32}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                        <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Monto']} />
                        <Bar dataKey="monto" radius={[6, 6, 0, 0]}>
                          {barData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                          ))}
                        </Bar>
                      </BarChart>
                    )
                  })()}
                </ResponsiveContainer>
              </div>

              {/* Pie chart: Método de pago */}
              <div className="bg-white p-5 rounded-xl border border-[var(--color-gris)]/20 shadow-sm">
                <div className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-4">Método de pago</div>
                {(metrics.efectivo + metrics.tarjeta) === 0 ? (
                  <div className="flex items-center justify-center h-[200px] text-sm text-[var(--color-gris)]">Sin ventas</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    {(() => {
                      const pieData = [
                        { name: 'Efectivo', value: metrics.efectivo, color: '#16a34a' },
                        { name: 'Tarjeta', value: metrics.tarjeta, color: '#0284c7' },
                      ]
                      return (
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%" cy="50%"
                            innerRadius={50} outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => `$${Number(v).toFixed(2)}`} />
                          <Legend formatter={v => <span className="text-xs font-bold">{v}</span>} />
                        </PieChart>
                      )
                    })()}
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Second Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Top 10 Productos */}
              <div className="bg-white p-5 rounded-xl border border-[var(--color-gris)]/20 shadow-sm">
                <div className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-4">Top 10 Productos Más Vendidos</div>
                {topProductsSortedByAmount.length === 0 ? (
                  <div className="flex items-center justify-center h-[250px] text-sm text-[var(--color-gris)]">Sin ventas en este período</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={topProductsSortedByAmount} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={true} vertical={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="nombre" type="category" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [v, 'Cantidad']} />
                      <Bar dataKey="cant" fill="#d97706" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Ventas por hora */}
              <div className="bg-white p-5 rounded-xl border border-[var(--color-gris)]/20 shadow-sm">
                <div className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-4">Ventas por Hora del Día</div>
                {hourlySales.length === 0 ? (
                  <div className="flex items-center justify-center h-[250px] text-sm text-[var(--color-gris)]">Sin ventas en este período</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={hourlySales} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                      <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Ventas']} labelFormatter={(label) => `Hora: ${label}`} />
                      <Bar dataKey="monto" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}

        {dashboardTab === 'top_productos' && (
          <div className="bg-white p-5 rounded-xl border border-[var(--color-gris)]/20 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-[var(--color-bronce)]">Top 10 Productos Más Vendidos</h3>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setTopProductSort('cantidad')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${topProductSort === 'cantidad' ? 'bg-white shadow-sm text-[var(--color-bronce)]' : 'text-gray-500'}`}
                >
                  Por Cantidad
                </button>
                <button 
                  onClick={() => setTopProductSort('ingreso')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${topProductSort === 'ingreso' ? 'bg-white shadow-sm text-[var(--color-bronce)]' : 'text-gray-500'}`}
                >
                  Por Ingreso
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[var(--color-crema)]/50 text-[var(--color-gris)] uppercase text-xs">
                  <tr>
                    <th className="p-3 rounded-tl-lg">Producto</th>
                    <th className="p-3">Cantidad</th>
                    <th className="p-3 rounded-tr-lg">Ingreso Generado</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTopProducts.map((p, i) => (
                    <tr key={i} className="border-b border-[var(--color-gris)]/10 hover:bg-gray-50">
                      <td className="p-3 font-medium">{p.nombre}</td>
                      <td className="p-3 font-bold">{p.cant}</td>
                      <td className="p-3 text-green-700 font-bold">${p.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-[var(--color-gris)]">No hay ventas en este período</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {dashboardTab === 'empleados' && (
          <div className="bg-white p-5 rounded-xl border border-[var(--color-gris)]/20 shadow-sm">
            <h3 className="font-bold text-lg text-[var(--color-bronce)] mb-4">Rendimiento de Empleados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[var(--color-crema)]/50 text-[var(--color-gris)] uppercase text-xs">
                  <tr>
                    <th className="p-3 rounded-tl-lg">Empleado</th>
                    <th className="p-3">Rol</th>
                    <th className="p-3">Total Cobrado (Caja)</th>
                    <th className="p-3">Prod. Añadidos (Mesero)</th>
                    <th className="p-3 rounded-tr-lg">Cancelaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.map((emp, i) => (
                    <tr key={emp.id} className="border-b border-[var(--color-gris)]/10 hover:bg-gray-50">
                      <td className="p-3 font-bold">{emp.nombre}</td>
                      <td className="p-3 uppercase text-xs tracking-wider text-[var(--color-gris)]">{emp.rol}</td>
                      <td className="p-3 text-green-700 font-bold">${emp.cobrado.toFixed(2)}</td>
                      <td className="p-3">{emp.agregados} items</td>
                      <td className="p-3 text-red-600 font-bold">{emp.cancelaciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
            
            <h3 className="font-serif font-bold text-xl text-[var(--color-bronce)] mt-8">Historial de Movimientos Manuales</h3>
            <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[800px]">
                <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] uppercase tracking-wider text-xs">
                  <tr>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Concepto</th>
                    <th className="p-4">Método</th>
                    <th className="p-4">Revisión</th>
                    <th className="p-4 text-right">Monto</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-gris)]/10">
                  {movements.slice((movementsPage - 1) * MOVEMENTS_PER_PAGE, movementsPage * MOVEMENTS_PER_PAGE).map(m => (
                    <tr key={m.id} className={!m.revisado_por_admin && m.tipo === 'egreso' ? 'bg-red-50/50' : ''}>
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-semibold">{new Date(m.fecha).toLocaleDateString()}</div>
                        <div className="text-xs text-[var(--color-gris)]">{new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold">{m.descripcion}</div>
                        <div className="text-xs text-[var(--color-gris)]">Registrado por: {m.created_by?.nombre || 'Sistema'}</div>
                      </td>
                      <td className="p-4">
                        {m.metodo && (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                            m.metodo === 'efectivo' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                          }`}>{m.metodo}</span>
                        )}
                      </td>
                      <td className="p-4">
                        {!m.revisado_por_admin && m.tipo === 'egreso' ? (
                          <button 
                            onClick={async () => {
                              await supabase.from('movements').update({ revisado_por_admin: true }).eq('id', m.id)
                              loadData()
                            }}
                            className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 transition-colors"
                          >
                            Marcar Revisado
                          </button>
                        ) : (
                          <span className="text-[10px] text-[var(--color-gris)]">✓</span>
                        )}
                      </td>
                      <td className={`p-4 text-right font-bold ${m.tipo === 'egreso' ? 'text-red-600' : 'text-green-600'}`}>
                        {m.tipo === 'egreso' ? '-' : '+'}${m.monto.toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600 hover:bg-red-50 hover:text-red-700 p-1 h-auto"
                          onClick={() => {
                            openConfirm("Eliminar Movimiento", "¿Borrar este movimiento definitivamente?", async () => {
                              closeConfirm()
                              const { error } = await supabase.from('movements').delete().eq('id', m.id)
                              if (error) alert("Error eliminando movimiento: " + error.message)
                              else loadData()
                            })
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-[var(--color-gris)]">No hay movimientos en esta fecha.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
              {movements.length > 0 && (
                <div className="p-3 border-t border-[var(--color-gris)]/10 bg-gray-50 flex items-center justify-between text-xs text-[var(--color-gris)]">
                  <div>
                    Mostrando {(movementsPage - 1) * MOVEMENTS_PER_PAGE + 1} - {Math.min(movementsPage * MOVEMENTS_PER_PAGE, movements.length)} de {movements.length}
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={movementsPage === 1}
                      onClick={() => setMovementsPage(p => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={movementsPage * MOVEMENTS_PER_PAGE >= movements.length}
                      onClick={() => setMovementsPage(p => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Zona de Peligro — Solo visible si el mes está archivado */}
            {mesArchivado === true && (
              <div className="mt-8 border-2 border-red-500 rounded-xl overflow-hidden bg-red-50">
                <div className="bg-red-500 text-white font-bold px-4 py-2 uppercase tracking-wider text-sm flex items-center gap-2">
                  <Trash2 size={18} /> Zona de Peligro: Borrado Permanente
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-sm text-red-900">
                    Has archivado este mes. Si deseas <strong>eliminar definitivamente</strong> todos sus registros para liberar espacio o porque ya no los necesitas, debes seguir estos pasos. Esta acción <strong>NO se puede deshacer</strong>.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    {/* Paso 1: Exportar */}
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${exportedMonth ? 'bg-green-500 text-white' : 'bg-red-200 text-red-900'}`}>
                        {exportedMonth ? '✓' : '1'}
                      </div>
                      <Button 
                        variant="outline" 
                        className={`bg-white hover:bg-gray-50 border-gray-300 ${exportedMonth ? 'opacity-50' : ''}`}
                        onClick={exportMonthToExcel}
                      >
                        <FileSpreadsheet size={16} className="mr-2" /> Exportar respaldo del mes
                      </Button>
                      {!exportedMonth && <span className="text-xs text-red-700 font-semibold">Obligatorio</span>}
                    </div>

                    {/* Paso 2: Confirmar */}
                    <div className={`flex items-center gap-3 transition-opacity ${!exportedMonth ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${deleteConfirmText === 'ELIMINAR' ? 'bg-green-500 text-white' : 'bg-red-200 text-red-900'}`}>
                        {deleteConfirmText === 'ELIMINAR' ? '✓' : '2'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-red-900 font-medium">Escribe <strong>ELIMINAR</strong>:</span>
                        <input 
                          type="text" 
                          className="border border-red-300 rounded px-3 py-1.5 text-sm uppercase font-bold text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                          value={deleteConfirmText}
                          onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
                          placeholder="ELIMINAR"
                        />
                      </div>
                    </div>

                    {/* Paso 3: Botón Borrar */}
                    <div className={`flex items-center gap-3 transition-opacity ${(!exportedMonth || deleteConfirmText !== 'ELIMINAR') ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-red-200 text-red-900">
                        3
                      </div>
                      <Button 
                        className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider"
                        disabled={!exportedMonth || deleteConfirmText !== 'ELIMINAR' || deletingMonth}
                        onClick={handleBorrarMesPermanente}
                      >
                        <Trash2 size={16} className="mr-2" /> 
                        {deletingMonth ? 'Borrando...' : 'Borrar mes permanentemente'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VENTAS (Historial) */}
        {activeTab === 'ventas' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Historial de Ventas</h2>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-gris)] cursor-pointer bg-white px-3 h-9 rounded-lg border border-[var(--color-gris)]/20 shadow-sm hover:bg-gray-50 transition-colors">
                  <input 
                    type="checkbox" 
                    className="accent-[var(--color-bronce)] w-4 h-4" 
                    checked={mostrarArchivados} 
                    onChange={e => setMostrarArchivados(e.target.checked)} 
                  />
                  Mostrar archivados
                </label>
                <div className="flex items-center gap-2">
                <select 
                  className="bg-white px-3 py-2 rounded-lg border border-[var(--color-gris)]/20 shadow-sm outline-none text-sm font-semibold text-[var(--color-bronce)] h-9"
                  value={ventasPeriod}
                  onChange={(e: any) => { setVentasPeriod(e.target.value); setVentasPage(1); }}
                >
                  <option value="dia">Día</option>
                  <option value="semana">Semana</option>
                  <option value="mes">Mes</option>
                </select>
                <div className="flex items-center bg-white rounded-lg border border-[var(--color-gris)]/20 shadow-sm overflow-hidden">
                  <button onClick={() => navigateVentasPeriod(-1)} className="p-2 hover:bg-gray-50 text-[var(--color-gris)] hover:text-[var(--color-bronce)] transition-colors border-r border-[var(--color-gris)]/10">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-4 py-2 text-sm font-bold text-[var(--color-negro)] min-w-[140px] text-center capitalize">
                    {formatVentasPeriodTitle()}
                  </div>
                  <button onClick={() => navigateVentasPeriod(1)} className="p-2 hover:bg-gray-50 text-[var(--color-gris)] hover:text-[var(--color-bronce)] transition-colors border-l border-[var(--color-gris)]/10">
                    <ChevronRight size={18} />
                  </button>
                </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] uppercase tracking-wider text-xs">
                    <tr>
                      <th className="p-4">Fecha/Hora</th>
                      <th className="p-4">Pedido</th>
                      <th className="p-4">Tipo</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Cobrado por</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-gris)]/10">
                    {ventasPayments.slice((ventasPage - 1) * VENTAS_PER_PAGE, ventasPage * VENTAS_PER_PAGE).map(p => (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="p-4 whitespace-nowrap">
                          <div className="font-semibold">{new Date(p.creado_en).toLocaleDateString()}</div>
                          <div className="text-xs text-[var(--color-gris)]">{new Date(p.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-mono text-xs font-bold text-[var(--color-negro)]">#{p.order_id?.substring(0,8).toUpperCase()}</div>
                          <div className="text-xs text-[var(--color-gris)]">{p.order?.order_items?.length || 0} items</div>
                        </td>
                        <td className="p-4 capitalize">
                          {formatOrderType(p.order?.tipo || '')} {p.order?.tipo === 'mesa' ? `(Mesa ${p.order?.tables?.numero})` : ''}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-[var(--color-negro)]">${p.monto_cobrado.toFixed(2)}</div>
                          <select
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase mt-1 border border-transparent hover:border-[var(--color-gris)]/30 focus:border-[var(--color-gris)]/50 outline-none cursor-pointer ${
                              p.metodo === 'efectivo' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                            }`}
                            value={p.metodo}
                            onChange={async (e) => {
                              if (!currentUser) return
                              const nuevoMetodo = e.target.value as 'efectivo' | 'tarjeta'
                              const res = await updatePaymentMethod({ paymentId: p.id, nuevoMetodo, employeeId: currentUser })
                              if (res?.error) {
                                alert(res.error)
                              } else {
                                loadData()
                              }
                            }}
                          >
                            <option value="efectivo">Efectivo</option>
                            <option value="tarjeta">Tarjeta</option>
                          </select>
                        </td>
                        <td className="p-4 text-xs text-[var(--color-gris)]">
                          {p.cobrador?.nombre || 'Sistema'}
                        </td>
                        <td className="p-4 text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => downloadTicketPDF(p)}
                            className="text-[var(--color-bronce)] border-[var(--color-gris)]/20 hover:bg-[var(--color-crema)] hover:text-[var(--color-bronce)]"
                          >
                            <Download size={14} className="mr-1.5" /> PDF
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {ventasPayments.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-[var(--color-gris)]">No hay ventas en este período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-[var(--color-gris)]">
                {ventasPayments.length === 0 && (
                  <span>No hay ventas para este periodo.</span>
                )}
                {ventasPayments.length > 0 && (
                  <span>
                    Mostrando {(ventasPage - 1) * VENTAS_PER_PAGE + 1} - {Math.min(ventasPage * VENTAS_PER_PAGE, ventasPayments.length)} de {ventasPayments.length}
                  </span>
                )}
              </div>
              <div className="flex border border-[var(--color-gris)]/20 rounded-lg overflow-hidden">
                    <button 
                      onClick={() => setVentasPage(p => Math.max(1, p - 1))}
                      disabled={ventasPage === 1}
                      className="px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 text-[var(--color-gris)] border-r border-[var(--color-gris)]/20"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button 
                      onClick={() => setVentasPage(p => p + 1)}
                      disabled={ventasPage * VENTAS_PER_PAGE >= ventasPayments.length}
                      className="px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 text-[var(--color-gris)]"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
            </div>
          </div>
        )}

        {/* PRODUCTOS */}
        {activeTab === 'productos' && (
          <div className="space-y-6">
            {/* Sub-tabs: Catálogo / Inventario General */}
            <div className="flex gap-2 border-b border-[var(--color-gris)]/20 pb-3">
              <button
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${productSubTab === 'catalogo' ? 'bg-[var(--color-bronce)] text-white' : 'bg-[var(--color-crema)] text-[var(--color-gris)] hover:text-[var(--color-negro)]'}`}
                onClick={() => setProductSubTab('catalogo')}
              >
                Catálogo
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${productSubTab === 'inventario' ? 'bg-[var(--color-bronce)] text-white' : 'bg-[var(--color-crema)] text-[var(--color-gris)] hover:text-[var(--color-negro)]'}`}
                onClick={() => setProductSubTab('inventario')}
              >
                📦 Inventario General
              </button>
            </div>

            {productSubTab === 'inventario' && <GeneralInventoryAdmin />}

            {productSubTab === 'catalogo' && <>
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center md:flex-wrap md:gap-2">
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Catálogo de Productos</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 md:flex-none h-9 px-3 text-xs tracking-normal md:h-12 md:px-6 md:py-3 md:text-sm md:tracking-widest"
                  onClick={() => { setEditingCategoryId(null); setCategoryForm({ nombre: '', orden: '0' }); setCategoryModalOpen(true) }}
                >
                  Editar Categorías
                </Button>
                <Button className="flex-1 md:flex-none h-9 px-3 text-xs tracking-normal md:h-12 md:px-6 md:py-3 md:text-sm md:tracking-widest" onClick={() => { setEditingProduct(null); setRemoveCurrentPhoto(false); setProductExtras([]); setPriceHistory([]); setProductModalOpen(true) }}>
                  <Plus size={14} className="mr-1.5 md:mr-2"/> Nuevo Producto
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-white border border-[var(--color-gris)]/20 rounded-xl overflow-hidden shadow-sm flex flex-col opacity-100 relative">
                  {!p.activo && <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center font-bold text-red-600 text-xl tracking-widest backdrop-blur-[1px]">INACTIVO</div>}
                  {p.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <div className="w-full h-32 md:h-48 relative">
                      <Image src={p.foto_url} alt={p.nombre} fill sizes="(max-width: 768px) 50vw, 300px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-full h-32 md:h-48 bg-[var(--color-crema)] flex items-center justify-center text-[var(--color-gris)] text-xs">Sin Foto</div>
                  )}
                  <div className="p-3 md:p-4 flex flex-col flex-1">
                    <div className="flex gap-2 items-center mb-1">
                      <span className="text-xs text-[var(--color-gris)] font-bold uppercase tracking-wider truncate">{p.categoria || 'Sin categoría'}</span>
                      {!p.categoria_id && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded flex-shrink-0">⚠️ Faltante</span>}
                    </div>
                    <span className="font-serif font-bold text-sm md:text-lg leading-tight mb-2 line-clamp-2">{p.nombre}</span>
                    <span className="font-bold text-[var(--color-bronce)] mt-auto text-sm md:text-base">${p.precio}</span>
                  {/* Stock badge + quick add */}
                  {p.maneja_inventario && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        (p.stock_actual ?? 0) <= 0
                          ? 'bg-red-100 text-red-600'
                          : (p.stock_actual ?? 0) <= (p.stock_minimo ?? 5)
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        📦 Stock: {p.stock_actual ?? 0}
                      </span>
                    </div>
                  )}
                </div>
                <div className="border-t border-[var(--color-gris)]/10 p-1.5 md:p-2 flex justify-between bg-gray-50 z-20">
                    {p.maneja_inventario && (
                      <button
                        onClick={() => handleQuickAddStock(p)}
                        disabled={stockAddingId === p.id}
                        className="p-2 hover:bg-green-100 rounded transition-colors text-green-600 font-bold text-lg leading-none" 
                        title="Agregar existencias"
                      >
                        {stockAddingId === p.id ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingProduct(p)
                        setRemoveCurrentPhoto(false)
                        setProductExtras([])
                        setPriceHistory([])
                        loadProductExtras(p.id)
                        loadPriceHistory(p.id)
                        setProductModalOpen(true)
                      }}
                      className="p-2 hover:bg-gray-100 rounded transition-colors text-[var(--color-gris)]"
                    >
                      <Edit size={16} />
                    </button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDeleteProduct(p)}>
                    <Trash2 size={16} />
                  </Button>
                  </div>
                </div>
              ))}
            </div>
          </>}
          </div>
        )}
        {/* EMPLEADOS */}
        {activeTab === 'empleados' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Personal</h2>
              <Button onClick={() => { setEditingEmployee(null); setEmployeeModalOpen(true) }}>
                <Plus size={16} className="mr-2"/> Nuevo Empleado
              </Button>
            </div>
            <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] uppercase tracking-wider text-xs">
                  <tr>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">PIN</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-gris)]/10">
                  {employees.map(e => (
                    <tr key={e.id}>
                      <td className="p-4 font-bold">{e.nombre}</td>
                      <td className="p-4 uppercase text-xs font-bold text-[var(--color-bronce)]">{e.rol}</td>
                      <td className="p-4 font-mono">{e.pin}</td>
                      <td className="p-4">
                        {e.activo ? <CheckCircle2 className="text-green-500" size={20}/> : <XCircle className="text-red-500" size={20}/>}
                      </td>
                      <td className="p-4 text-right flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingEmployee(e); setEmployeeModalOpen(true) }}>
                          <Edit size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDeleteEmployee(e)}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* MESAS */}
        {activeTab === 'mesas' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Configuración de Mesas</h2>
              <Button onClick={() => setTableModalOpen(true)}>
                <Plus size={16} className="mr-2"/> Nueva Mesa
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {tables.map(t => (
                <div key={t.id} className="bg-white p-6 rounded-xl border border-[var(--color-gris)]/20 shadow-sm flex flex-col items-center gap-2 relative">
                  <span className="font-bold text-2xl text-[var(--color-bronce)]">Mesa {t.numero}</span>
                  <span className="text-xs uppercase tracking-widest text-[var(--color-gris)]">{t.estado}</span>
                  <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-red-500" onClick={() => handleDeleteTable(t)}>
                    <Trash2 size={16}/>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* MOVIMIENTOS */}
        {activeTab === 'movimientos' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Registrar Movimiento Manual</h2>
              <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-gris)] cursor-pointer bg-white px-3 h-9 rounded-lg border border-[var(--color-gris)]/20 shadow-sm hover:bg-gray-50 transition-colors">
                <input 
                  type="checkbox" 
                  className="accent-[var(--color-bronce)] w-4 h-4" 
                  checked={mostrarArchivados} 
                  onChange={e => setMostrarArchivados(e.target.checked)} 
                />
                Mostrar archivados
              </label>
            </div>
            <form onSubmit={handleAddMovement} className="bg-white p-6 rounded-xl border border-[var(--color-gris)]/20 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Tipo</label>
                <select name="tipo" className="flex h-12 w-full rounded-md border border-[var(--color-gris)] bg-white px-3 focus:ring-2 focus:ring-[var(--color-bronce)] outline-none">
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Método</label>
                <select name="metodo" className="flex h-12 w-full rounded-md border border-[var(--color-gris)] bg-white px-3 focus:ring-2 focus:ring-[var(--color-bronce)] outline-none">
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Monto</label>
                <Input type="number" name="monto" required step="0.01" min="0" placeholder="0.00" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Descripción</label>
                <div className="flex gap-4">
                  <Input type="text" name="descripcion" required className="flex-1" placeholder="Ej: Compra de insumos" />
                  <Button type="submit">Guardar</Button>
                </div>
              </div>
            </form>

            <div className="mt-8">
              <h3 className="font-serif font-bold text-xl text-[var(--color-bronce)] mb-4 capitalize">
                Movimientos: {formatPeriodTitle()}
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex justify-between items-center">
                  <span className="font-bold text-green-800">Subtotal Ingresos</span>
                  <span className="text-xl font-bold text-green-600">+${metrics.ingresosManuales.toFixed(2)}</span>
                </div>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex justify-between items-center">
                  <span className="font-bold text-red-800">Subtotal Egresos</span>
                  <span className="text-xl font-bold text-red-600">-${metrics.egresosManuales.toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[700px]">
                  <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] uppercase tracking-wider text-xs">
                    <tr>
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Concepto</th>
                      <th className="p-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-gris)]/10">
                    {movements.slice((movementsPage - 1) * MOVEMENTS_PER_PAGE, movementsPage * MOVEMENTS_PER_PAGE).map(m => (
                      <tr key={m.id}>
                        <td className="p-4 whitespace-nowrap">
                          <div className="font-semibold">{new Date(m.fecha).toLocaleDateString()}</div>
                          <div className="text-xs text-[var(--color-gris)]">{new Date(m.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold">{m.descripcion}</div>
                          <div className="text-xs text-[var(--color-gris)]">Registrado por: {m.created_by?.nombre || 'Sistema'}</div>
                        </td>
                        <td className={`p-4 text-right font-bold ${m.tipo === 'egreso' ? 'text-red-600' : 'text-green-600'}`}>
                          {m.tipo === 'egreso' ? '-' : '+'}${m.monto.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {movements.length === 0 && (
                      <tr><td colSpan={3} className="p-8 text-center text-[var(--color-gris)]">No hay movimientos en esta fecha.</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
                {movements.length > 0 && (
                  <div className="p-3 border-t border-[var(--color-gris)]/10 bg-gray-50 flex items-center justify-between text-xs text-[var(--color-gris)]">
                    <div>
                      Mostrando {(movementsPage - 1) * MOVEMENTS_PER_PAGE + 1} - {Math.min(movementsPage * MOVEMENTS_PER_PAGE, movements.length)} de {movements.length}
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={movementsPage === 1}
                        onClick={() => setMovementsPage(p => p - 1)}
                      >
                        Anterior
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={movementsPage * MOVEMENTS_PER_PAGE >= movements.length}
                        onClick={() => setMovementsPage(p => p + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Historial de Pagos (Tickets Cobrados) */}
              <div className="mt-8">
                <h3 className="font-bold text-[var(--color-gris)] mb-4">Historial de Pagos (Tickets Cobrados)</h3>
                <div className="bg-white rounded-xl shadow-sm border border-[var(--color-gris)]/20 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 border-b border-[var(--color-gris)]/10 text-[var(--color-gris)] uppercase text-xs">
                        <tr>
                          <th className="px-4 py-3 font-bold">Hora</th>
                          <th className="px-4 py-3 font-bold">Método</th>
                          <th className="px-4 py-3 font-bold">Monto</th>
                          <th className="px-4 py-3 font-bold text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.length === 0 && (
                          <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No hay pagos registrados hoy.</td></tr>
                        )}
                        {payments.map(p => {
                          const time = new Date(p.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                          return (
                            <tr key={p.id} className={`border-b border-[var(--color-gris)]/10 hover:bg-gray-50 ${p.anulado ? 'opacity-50 bg-red-50' : ''}`}>
                              <td className="px-4 py-3">{time}</td>
                              <td className="px-4 py-3 font-medium capitalize">
                                {!p.anulado && new Date(p.creado_en).toDateString() === new Date().toDateString() ? (
                                  <span className="inline-flex items-center gap-1">
                                    {p.metodo}
                                    <button
                                      className="text-[10px] text-[var(--color-bronce)] underline ml-1"
                                      onClick={() => {
                                        const nuevoMetodo = p.metodo === 'efectivo' ? 'tarjeta' : 'efectivo'
                                        if (confirm(`¿Cambiar método de pago de \${p.metodo} → \${nuevoMetodo}?`)) {
                                          supabase.rpc('editar_metodo_pago', { p_payment_id: p.id, p_nuevo_metodo: nuevoMetodo, p_employee_id: employeeId })
                                            .then(({ error }: any) => { if (error) alert(error.message); else loadData() })
                                        }
                                      }}
                                    >
                                      cambiar
                                    </button>
                                  </span>
                                ) : p.metodo}
                              </td>
                              <td className="px-4 py-3 font-bold">
                                {p.anulado ? (
                                  <span className="line-through text-gray-500">${p.monto_cobrado.toFixed(2)}</span>
                                ) : (
                                  <span className="text-green-600">${p.monto_cobrado.toFixed(2)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {p.anulado ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="text-xs font-bold text-red-600">Anulado: {p.motivo_anulacion}</span>
                                    {new Date(p.creado_en).toDateString() === new Date().toDateString() ? (
                                      <button
                                        className="text-[10px] font-bold text-[var(--color-bronce)] underline"
                                        onClick={() => {
                                          if (confirm('¿Desanular este pago? Se volverá a marcar como cobrado.')) {
                                            supabase.rpc('desanular_pago', { p_payment_id: p.id, p_employee_id: employeeId })
                                              .then(({ error }: any) => {
                                                if (error) alert(error.message)
                                                else loadData()
                                              })
                                          }
                                        }}
                                      >
                                        Deshacer anulación
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-[var(--color-gris)] italic">Solo hoy</span>
                                    )}
                                  </div>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="danger" 
                                    onClick={() => {
                                      const motivo = prompt('Motivo de anulación (Reabrirá el pedido):')
                                      if (motivo) {
                                        supabase.rpc('anular_pago', { p_payment_id: p.id, p_motivo: motivo, p_employee_id: employeeId })
                                          .then(({error}: any) => {
                                            if (error) alert(error.message)
                                            else loadData()
                                          })
                                      }
                                    }}
                                  >
                                    Anular
                                  </Button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CORTES DE CAJA */}
        {activeTab === 'cortes' && (() => {
          // Load cortes when tab is first activated
          if (!loadingCortes && cortes.length === 0) loadCortes()
          return (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Historial de Cortes de Caja</h2>
                <Button variant="outline" onClick={loadCortes} disabled={loadingCortes} className="flex items-center gap-2">
                  <RefreshCw size={16} className={loadingCortes ? 'animate-spin' : ''} />
                  {loadingCortes ? 'Cargando...' : 'Actualizar'}
                </Button>
              </div>
              {loadingCortes ? (
                <p className="text-[var(--color-gris)] text-sm">Cargando cortes...</p>
              ) : cortes.length === 0 ? (
                <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm p-12 text-center text-[var(--color-gris)]">
                  <div className="text-5xl mb-3">🏦</div>
                  <p className="font-semibold text-lg">Sin cortes registrados</p>
                  <p className="text-sm">Los cortes de caja se hacen desde la vista de Cajero.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[600px]">
                    <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] uppercase tracking-wider text-xs">
                      <tr>
                        <th className="p-4">Fecha</th>
                        <th className="p-4">Cajero</th>
                        <th className="p-4 text-right">Efectivo Esperado (Sistema)</th>
                        <th className="p-4 text-right">Efectivo Real (En cajón)</th>
                        <th className="p-4 text-right">Diferencia</th>
                        <th className="p-4 text-right">Tarjeta</th>
                        <th className="p-4">Notas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-gris)]/10">
                      {cortes.map((c: any) => {
                        const diff = Number(c.diferencia)
                        return (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="p-4 text-[var(--color-gris)] whitespace-nowrap">
                              <div className="font-semibold text-[var(--color-negro)]">
                                {format(new Date(c.creado_en), "d MMM yyyy", { locale: es })}
                              </div>
                              <div className="text-xs">
                                {format(new Date(c.fecha_inicio), "HH:mm")} – {format(new Date(c.fecha_fin), "HH:mm")}
                              </div>
                            </td>
                            <td className="p-4 font-semibold">{c.empleado?.nombre || '—'}</td>
                            <td className="p-4 text-right font-mono">${Number(c.efectivo_sistema).toFixed(2)}</td>
                            <td className="p-4 text-right font-mono">${Number(c.efectivo_contado).toFixed(2)}</td>
                            <td className="p-4 text-right">
                              <span className={`inline-block font-bold font-mono px-2 py-0.5 rounded-full text-sm ${
                                diff === 0
                                  ? 'bg-green-100 text-green-700'
                                  : diff > 0
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-4 text-right font-mono">${Number(c.tarjeta_sistema).toFixed(2)}</td>
                            <td className="p-4 text-[var(--color-gris)] text-xs max-w-[200px] whitespace-normal break-words" title={c.notas || ''}>{c.notas || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* CONFIGURACIÓN */}
        {activeTab === 'configuracion' && (
          <div className="space-y-6 max-w-2xl">
            <h2 className="font-serif font-bold text-2xl text-[var(--color-bronce)]">Configuración General</h2>
            <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-xl border border-[var(--color-gris)]/20 shadow-sm space-y-4">
              <h3 className="font-bold text-[var(--color-negro)] border-b pb-2">Impresión de Tickets</h3>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Impresora Activa</label>
                <select name="impresora_activa" defaultValue={settings?.impresora_activa ? 'true' : 'false'} className="w-full h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white">
                  <option value="true">Sí (Imprimir al cobrar)</option>
                  <option value="false">No (No imprimir nada)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Modo de Impresora</label>
                <select
                  name="impresora_modo"
                  value={printerMode}
                  onChange={event => setPrinterMode(event.target.value)}
                  className="w-full h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white"
                >
                  <option value="android_usb">USB Android — APK Cristi's POS (automático)</option>
                  <option value="android_bluetooth">Bluetooth Android — APK Cristi's POS (automático)</option>
                  <option value="usb_qz">USB Windows vía QZ Tray (automático)</option>
                  <option value="red">Red WiFi / Ethernet</option>
                  <option value="bluetooth">Bluetooth / impresión manual del sistema</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Tamaño de Papel (Ancho)</label>
                <select
                  name="impresora_papel_mm"
                  defaultValue={settings?.impresora_papel_mm || '80'}
                  className="w-full h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white"
                >
                  <option value="80">80 mm (Impresora Grande - 48 caracteres)</option>
                  <option value="58">58 mm (Impresora Pequeña - 32 caracteres)</option>
                </select>
              </div>
              
              {/* Conditional fields depending on mode */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                {printerMode === 'android_usb' && <AndroidPrinterPanel />}
                {printerMode === 'android_bluetooth' && <AndroidBluetoothPrinterPanel />}

                {printerMode === 'red' && (
                  <div>
                    <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">IP de la Impresora</label>
                    <Input type="text" name="impresora_ip" defaultValue={settings?.impresora_ip || ''} placeholder="Ej: 192.168.1.200" />
                    <p className="text-[10px] text-gray-500 mt-2">La impresora debe aceptar ePOS-Print y estar en la misma red.</p>
                  </div>
                )}
                {printerMode !== 'red' && <input type="hidden" name="impresora_ip" value={settings?.impresora_ip || ''} />}

                {printerMode === 'usb_qz' && (
                  <div>
                    <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Nombre Impresora Windows</label>
                    <div className="flex gap-2 mb-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleDetectPrinters}
                        disabled={detectingPrinters}
                        className="w-full"
                      >
                        <span className="mr-2">🔍</span> {detectingPrinters ? 'Buscando impresoras...' : 'Buscar impresoras QZ'}
                      </Button>
                    </div>
                    {printerDetectError && <div className="text-xs text-red-600 font-bold mb-2">{printerDetectError}</div>}
                    {detectedPrinters.length > 0 ? (
                      <select
                        name="nombre_impresora_windows"
                        defaultValue={settings?.nombre_impresora_windows || ''}
                        className="w-full h-10 rounded-md border border-[var(--color-gris)] px-3 bg-white text-sm"
                      >
                        <option value="">Selecciona una impresora...</option>
                        {detectedPrinters.map(printer => <option key={printer} value={printer}>{printer}</option>)}
                      </select>
                    ) : (
                      <Input
                        type="text"
                        name="nombre_impresora_windows"
                        defaultValue={settings?.nombre_impresora_windows || ''}
                        placeholder="Ej: POS58 Printer"
                      />
                    )}
                    <p className="text-[10px] text-gray-500 mt-2">QZ Tray debe estar instalado y abierto en la computadora Windows conectada por USB.</p>
                  </div>
                )}
                {printerMode !== 'usb_qz' && <input type="hidden" name="nombre_impresora_windows" value={settings?.nombre_impresora_windows || ''} />}

                {printerMode === 'bluetooth' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Este modo abre la impresión manual del sistema. Para tickets automáticos desde las Lenovo, utiliza “USB Android — APK Cristi's POS”.
                  </div>
                )}
              </div>

              {/* IMPRESORA COCINA */}
              <div className="mt-6 border-t pt-4">
                <h3 className="font-bold text-[var(--color-negro)] mb-4 border-b pb-2">Impresora de Cocina</h3>
                <div>
                  <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Impresora Cocina Activa</label>
                  <select name="impresora_cocina_activa" defaultValue={settings?.impresora_cocina_activa ? 'true' : 'false'} className="w-full h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white">
                    <option value="true">Sí (Imprimir automático al Enviar a Cocina)</option>
                    <option value="false">No (Desactivada)</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Modo de Impresora Cocina</label>
                  <select
                    name="impresora_cocina_modo"
                    value={kitchenPrinterMode}
                    onChange={event => setKitchenPrinterMode(event.target.value)}
                    className="w-full h-12 rounded-md border border-[var(--color-gris)] px-3 bg-white"
                  >
                    <option value="android_usb">USB Android — APK Cristi's POS (automático)</option>
                    <option value="android_bluetooth">Bluetooth Android — APK Cristi's POS (automático)</option>
                    <option value="usb_qz">USB Windows vía QZ Tray (automático)</option>
                    <option value="red">Red WiFi / Ethernet</option>
                    <option value="bluetooth">Bluetooth / impresión manual del sistema</option>
                  </select>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4 mt-4">
                  {kitchenPrinterMode === 'red' && (
                    <div>
                      <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">IP de la Impresora de Cocina</label>
                      <Input type="text" name="impresora_cocina_ip" defaultValue={settings?.impresora_cocina_ip || ''} placeholder="Ej: 192.168.1.201" />
                    </div>
                  )}
                  {kitchenPrinterMode !== 'red' && <input type="hidden" name="impresora_cocina_ip" value={settings?.impresora_cocina_ip || ''} />}
                  
                  {kitchenPrinterMode === 'usb_qz' && (
                    <div>
                      <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Nombre Impresora Windows (Cocina)</label>
                      <Input type="text" name="impresora_cocina_qz_nombre" defaultValue={settings?.impresora_cocina_qz_nombre || ''} placeholder="Ej: COCINA_PRINTER" />
                    </div>
                  )}
                  {kitchenPrinterMode !== 'usb_qz' && <input type="hidden" name="impresora_cocina_qz_nombre" value={settings?.impresora_cocina_qz_nombre || ''} />}
                </div>
              </div>

              {/* TICKET CUSTOMIZATION */}
              <div className="mt-6 border-t pt-4">
                <h3 className="font-bold text-[var(--color-negro)] mb-4">Personalizar Ticket</h3>

                {/* BUSINESS INFO */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-4 space-y-3">
                  <h4 className="font-bold text-sm text-[var(--color-gris)] uppercase">Datos del Negocio</h4>

                  <div>
                    <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-1">Nombre del Negocio</label>
                    <Input type="text" name="negocio_nombre"
                      value={ticketPreview.negocioNombre}
                      onChange={(e: any) => setTicketPreview(p => ({ ...p, negocioNombre: e.target.value }))}
                      placeholder="Cristi's Coffe & Snack"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-1">Dirección (opcional)</label>
                    <Input type="text" name="negocio_direccion"
                      value={ticketPreview.negocioDireccion}
                      onChange={(e: any) => setTicketPreview(p => ({ ...p, negocioDireccion: e.target.value }))}
                      placeholder="Calle, Número, Ciudad"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-1">Teléfono (opcional)</label>
                      <Input type="text" name="negocio_telefono"
                        value={ticketPreview.negocioTelefono}
                        onChange={(e: any) => setTicketPreview(p => ({ ...p, negocioTelefono: e.target.value }))}
                        placeholder="555-123-4567"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-1">RFC (opcional)</label>
                      <Input type="text" name="negocio_rfc"
                        value={ticketPreview.negocioRfc}
                        onChange={(e: any) => setTicketPreview(p => ({ ...p, negocioRfc: e.target.value }))}
                        placeholder="ABC123456789"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-1">Línea Extra (redes sociales, horario, etc. — opcional)</label>
                    <Input type="text" name="ticket_linea_extra"
                      value={ticketPreview.lineaExtra}
                      onChange={(e: any) => setTicketPreview(p => ({ ...p, lineaExtra: e.target.value }))}
                      placeholder="Ej: @CristisCoffe | Lun-Sab 8am-8pm"
                    />
                  </div>

                  {/* LOGO UPLOADER */}
                  <div className="pt-2 border-t border-gray-200">
                    <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Logotipo del Ticket</label>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="relative h-16 w-32 border border-gray-200 rounded bg-white p-1">
                        <Image
                          src={ticketPreview.logoUrl || '/LogoCristisCofre.png'}
                          alt="Logo actual"
                          fill
                          className="object-contain"
                          sizes="128px"
                        />
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="cursor-pointer">
                            <span className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-[var(--color-gris)]/30 rounded bg-white hover:bg-gray-50 text-[var(--color-negro)]">
                              {logoUploading ? 'Procesando...' : '📤 Subir nuevo'}
                            </span>
                            <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                              onChange={handleSelectLogoFile}
                            />
                          </label>
                          {ticketPreview.logoUrl && (
                            <button type="button" onClick={handleEditExistingLogo} disabled={logoUploading}
                              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-[var(--color-gris)]/30 rounded bg-white hover:bg-gray-50 text-[var(--color-negro)]">
                              ✂️ Editar recorte
                            </button>
                          )}
                        </div>
                        {ticketPreview.logoUrl && (
                          <button type="button" onClick={handleRestoreDefaultLogo}
                            className="text-xs text-[var(--color-gris)] hover:text-red-600 underline block mt-2">
                            Restaurar logo original de Cristi's
                          </button>
                        )}
                        <p className="text-[10px] text-gray-400">La vista previa muestra el logo a color. En impresora t\u00e9rmica se convierte a blanco y negro autom\u00e1ticamente.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Tamaño de Fuente</label>
                      <div className="flex gap-2">
                        {['pequena', 'normal', 'grande'].map(size => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setTicketPreview(p => ({ ...p, tamano: size }))}
                            className={`flex-1 py-2 text-sm rounded border capitalize ${ticketPreview.tamano === size ? 'bg-[var(--color-bronce)] text-white border-[var(--color-bronce)]' : 'bg-white text-[var(--color-gris)] border-[var(--color-gris)]/30 hover:bg-gray-50'}`}
                          >
                            {size === 'pequena' ? 'Pequeña' : size === 'normal' ? 'Normal' : 'Grande'}
                          </button>
                        ))}
                      </div>
                      <input type="hidden" name="ticket_tamano_fuente" value={ticketPreview.tamano} />
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Mensaje de Despedida</label>
                      <Input
                        type="text"
                        name="ticket_mensaje_despedida"
                        value={ticketPreview.mensaje}
                        onChange={(e: any) => setTicketPreview(p => ({ ...p, mensaje: e.target.value }))}
                        placeholder="Ej: ¡Gracias por su compra!"
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          name="ticket_mostrar_logo"
                          checked={ticketPreview.logo}
                          onChange={(e) => setTicketPreview(p => ({ ...p, logo: e.target.checked }))}
                          className="w-5 h-5 text-[var(--color-bronce)] rounded"
                        />
                        <span className="text-sm font-semibold text-[var(--color-negro)]">Mostrar Logotipo</span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          name="ticket_mostrar_atendido_por"
                          checked={ticketPreview.atendido}
                          onChange={(e) => setTicketPreview(p => ({ ...p, atendido: e.target.checked }))}
                          className="w-5 h-5 text-[var(--color-bronce)] rounded"
                        />
                        <span className="text-sm font-semibold text-[var(--color-negro)]">Mostrar "Atendido por: [Nombre]"</span>
                      </label>
                    </div>
                  </div>

                  {/* LIVE PREVIEW */}
                  <div className="bg-gray-100 p-4 rounded-xl flex items-center justify-center">
                    <div className="bg-white shadow-lg p-4 w-full max-w-[260px] text-black" style={{ fontFamily: 'monospace' }}>
                      <div className="flex flex-col items-center border-b-2 border-dashed border-gray-300 pb-3 mb-3">
                        {ticketPreview.logo && (
                          <div className="relative h-12 w-24 mb-2">
                            <Image
                              src={ticketPreview.logoUrl || '/LogoCristisCofre.png'}
                              alt="Logo"
                              fill
                              className="object-contain"
                              sizes="96px"
                            />
                          </div>
                        )}
                        <h1 className="text-sm font-bold text-center uppercase">{ticketPreview.negocioNombre ?? "Cristi's Coffe & Snack"}</h1>
                        {ticketPreview.negocioDireccion && <p className="text-[10px] text-center">{ticketPreview.negocioDireccion}</p>}
                        {ticketPreview.negocioTelefono && <p className="text-[10px] text-center">Tel: {ticketPreview.negocioTelefono}</p>}
                        {ticketPreview.negocioRfc && <p className="text-[10px] text-center">RFC: {ticketPreview.negocioRfc}</p>}
                        <p className="text-[10px] text-center mt-1">Ticket #0001</p>
                        <p className="text-[10px] text-center">{new Date().toLocaleString('es-MX')}</p>
                      </div>

                      <div className={`space-y-1 mb-3 ${ticketPreview.tamano === 'pequena' ? 'text-[9px]' : ticketPreview.tamano === 'grande' ? 'text-xs font-bold' : 'text-[10px]'}`}>
                        <div className="flex justify-between border-b border-gray-200 pb-1 mb-1">
                          <span className="font-bold">CANT</span>
                          <span className="font-bold">DESCRIPCIÓN</span>
                          <span className="font-bold">TOTAL</span>
                        </div>
                        <div className="flex justify-between">
                          <span>1x</span>
                          <span className="flex-1 px-1 text-left truncate">Café Americano</span>
                          <span>$45.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>2x</span>
                          <span className="flex-1 px-1 text-left truncate">Pan Francés</span>
                          <span>$70.00</span>
                        </div>
                      </div>

                      <div className="border-t-2 border-dashed border-gray-300 pt-2">
                        <div className="flex justify-between font-bold text-xs">
                          <span>TOTAL:</span>
                          <span>$115.00</span>
                        </div>
                      </div>

                      <div className="mt-4 text-center">
                        {ticketPreview.atendido && <p className="text-[10px] mb-1">Atendido por: Karla</p>}
                        {ticketPreview.lineaExtra && <p className="text-[10px] mb-1">{ticketPreview.lineaExtra}</p>}
                        <p className="text-[10px] break-words">{ticketPreview.mensaje || ' '}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full mt-4">Guardar Configuración</Button>
            </form>

            <div className="bg-white p-6 rounded-xl border border-[var(--color-gris)]/20 shadow-sm mt-8 space-y-4">
              <h3 className="font-bold text-lg text-[var(--color-bronce)] border-b pb-2">Respaldos y Datos</h3>
              <p className="text-sm text-[var(--color-gris)]">
                Descarga un archivo Excel con todas las tablas del sistema, incluyendo todo el historial desde el inicio. No incluye contraseñas ni PINs de usuarios.
              </p>
              <Button variant="outline" onClick={downloadFullBackup} className="w-full border-[var(--color-bronce)] text-[var(--color-bronce)] hover:bg-[var(--color-crema)] hover:text-[var(--color-bronce)]">
                Descargar respaldo completo
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* --- MODALS --- */}
      <Modal isOpen={isMetasModalOpen} onClose={() => setMetasModalOpen(false)} title="Editar Metas de Venta">
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Meta Diaria</label>
            <Input type="number" step="0.01" name="meta_diaria" defaultValue={settings?.meta_diaria || 0} />
          </div>
          <div>
            <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Meta Semanal</label>
            <Input type="number" step="0.01" name="meta_semanal" defaultValue={settings?.meta_semanal || 0} />
          </div>
          <div>
            <label className="block text-xs uppercase font-bold text-[var(--color-gris)] mb-2">Meta Mensual</label>
            <Input type="number" step="0.01" name="meta_mensual" defaultValue={settings?.meta_mensual || 0} />
          </div>
          {/* Include hidden fields for existing settings so they don't get erased */}
          <input type="hidden" name="impresora_activa" value={settings?.impresora_activa ? 'true' : 'false'} />
          <input type="hidden" name="impresora_modo" value={settings?.impresora_modo || 'red'} />
          <input type="hidden" name="impresora_ip" value={settings?.impresora_ip || ''} />
          
          <div className="sticky bottom-[-24px] bg-white p-4 -mx-6 -mb-6 mt-6 border-t border-[var(--color-gris)]/20 z-10">
            <Button type="submit" className="w-full safe-bottom" onClick={() => setTimeout(() => setMetasModalOpen(false), 300)}>Guardar Metas</Button>
          </div>
        </form>
      </Modal>

      {/* --- CROP MODAL --- */}
      <Modal isOpen={cropModalOpen} onClose={() => setCropModalOpen(false)} title="Recortar y Posicionar Logotipo">
        <p className="text-xs text-gray-500 mb-2">Puedes hacer la imagen m\u00e1s peque\u00f1a que el marco y moverla hacia un lado para alinear el logo a la izquierda o derecha en el ticket.</p>
        <div className="relative w-full h-64 bg-gray-200 border border-gray-300 rounded-md overflow-hidden mb-4">
          {imageToCrop && (
            <Cropper
              image={imageToCrop}
              crop={crop}
              zoom={zoom}
              aspect={3 / 1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              restrictPosition={false}
              minZoom={0.2}
            />
          )}
        </div>
        <div className="px-2 mb-6">
          <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Zoom</label>
          <input
            type="range"
            value={zoom}
            min={0.2}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCropModalOpen(false)} className="flex-1">Cancelar</Button>
          <Button variant="primary" onClick={handleConfirmCrop} className="flex-1">Aplicar y Subir</Button>
        </div>
      </Modal>

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={closeConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
      />

      <Modal isOpen={isTableModalOpen} onClose={() => setTableModalOpen(false)} title="Nueva Mesa">
        <form onSubmit={handleSaveTable} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Número o nombre de la mesa</label>
            <Input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="Ej: 10, VIP, Terraza" required />
          </div>
          <div className="sticky bottom-[-24px] bg-white p-4 -mx-6 -mb-6 mt-6 border-t border-[var(--color-gris)]/20 z-10">
            <Button type="submit" className="w-full safe-bottom">Guardar Mesa</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isProductModalOpen} onClose={() => setProductModalOpen(false)} title={editingProduct ? "Editar Producto" : "Nuevo Producto"}>
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div><label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Nombre</label><Input name="nombre" defaultValue={editingProduct?.nombre} required /></div>
          <div><label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Precio</label><Input type="number" step="0.01" name="precio" defaultValue={editingProduct?.precio} required /></div>
          <div><label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Categoría</label>
            <select
              name="categoria_id"
              defaultValue={editingProduct?.categoria_id || ''}
              onChange={(e) => {
                const selected = categories.find((c: any) => c.id === e.target.value)
                const hiddenInput = (e.target.form as HTMLFormElement)?.querySelector('input[name="categoria"]') as HTMLInputElement
                if (hiddenInput && selected) hiddenInput.value = selected.nombre
              }}
              className="h-12 w-full rounded border border-[var(--color-gris)] px-3 bg-white"
              required
            >
              <option value="">-- Selecciona categoría --</option>
              {categories.filter((c: any) => c.activo).map((c: any) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {/* Hidden field keeps categoria text in sync for backward compat */}
            <input
              type="hidden"
              name="categoria"
              defaultValue={editingProduct?.categoria || ''}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Foto (Auto optimizada a WebP)</label>
            <input type="file" name="foto" accept="image/*" className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-[var(--color-crema)] file:text-[var(--color-bronce)] hover:file:bg-[var(--color-bronce)]/10" />
            {editingProduct?.foto_url && !removeCurrentPhoto && (
              <div className="mt-2 flex items-center gap-4">
                <div className="h-20 w-20 relative rounded shadow-sm border border-[var(--color-gris)]/20 overflow-hidden">
                  <Image src={editingProduct.foto_url} alt="Current" fill sizes="80px" className="object-cover" />
                </div>
                <Button type="button" variant="danger" size="sm" onClick={() => setRemoveCurrentPhoto(true)}>
                  Eliminar foto
                </Button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Turno</label>
            <select name="turno" defaultValue={editingProduct?.turno || 'todo_dia'} className="h-12 w-full rounded border border-[var(--color-gris)] px-3">
              <option value="todo_dia">Todo el día</option>
              <option value="manana">Mañana (Desayunos)</option>
              <option value="tarde">Tarde</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Estado</label>
            <select name="activo" defaultValue={editingProduct?.activo === false ? 'false' : 'true'} className="h-12 w-full rounded border border-[var(--color-gris)] px-3">
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>

          {/* ── Control de inventario ───────────────────────────────── */}
          <div className="border border-[var(--color-gris)]/20 rounded-xl p-4 bg-gray-50 space-y-3">
            <p className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider">📦 Control de inventario
              <span className="ml-1 font-normal normal-case text-[var(--color-gris)]/70">(opcional)</span>
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="maneja_inventario_toggle"
                name="maneja_inventario"
                value="true"
                defaultChecked={editingProduct?.maneja_inventario === true}
                onChange={e => {
                  const stockField = document.getElementById('stock_actual_field') as HTMLElement
                  if (stockField) stockField.style.display = e.target.checked ? 'block' : 'none'
                }}
                className="w-5 h-5 rounded accent-[var(--color-bronce)]"
              />
              <span className="text-sm font-semibold text-[var(--color-negro)]">Llevar control de existencias</span>
            </label>
            <div
              id="stock_actual_field"
              style={{ display: editingProduct?.maneja_inventario ? 'block' : 'none' }}
            >
              <label className="block text-xs font-bold text-[var(--color-gris)] mb-1 mt-2">Cantidad disponible (stock actual)</label>
              <Input
                type="number"
                name="stock_actual"
                min="0"
                defaultValue={editingProduct ? (editingProduct.stock_actual ?? 0) : 0}
                placeholder="Ej: 10"
                required={true}
              />
              <label className="block text-xs font-bold text-[var(--color-gris)] mb-1 mt-3">Alerta de stock bajo (stock mínimo)</label>
              <Input
                type="number"
                name="stock_minimo"
                min="0"
                defaultValue={editingProduct?.stock_minimo ?? 5}
                placeholder="Ej: 5"
              />
              <p className="text-[10px] text-[var(--color-gris)] mt-1">El sistema descontará 1 unidad por cada unidad vendida automáticamente. Si el stock baja del mínimo, se mostrará una alerta visual.</p>
            </div>
          </div>
          {/* ── Extras de este producto ─────────────────────────────── */}
          <div className="border-t border-[var(--color-gris)]/20 pt-4 mt-2">
            <p className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider mb-3">Extras de este producto</p>
            {!editingProduct ? (
              <p className="text-xs text-[var(--color-gris)] italic bg-gray-50 rounded-lg px-3 py-2">
                💡 Guarda el producto primero para poder agregarle extras.
              </p>
            ) : (
              <div className="space-y-2">
                {/* List of existing extras */}
                {loadingExtras ? (
                  <p className="text-xs text-[var(--color-gris)] italic">Cargando extras...</p>
                ) : productExtras.length === 0 ? (
                  <p className="text-xs text-[var(--color-gris)] italic">Sin extras configurados aún.</p>
                ) : (
                  <div className="space-y-1 mb-3">
                    {/* Variantes */}
                    {productExtras.filter(e => e.es_variante_unica).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-purple-600 tracking-widest mb-1">Variantes (elección única)</p>
                        {productExtras.filter(e => e.es_variante_unica).map(extra => (
                          <div key={extra.id} className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg px-3 py-1.5">
                            <div>
                              <span className="text-sm font-semibold text-purple-800">{extra.nombre}</span>
                              <span className="ml-2 text-xs text-purple-500">sin costo adicional</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteExtra(extra.id)}
                              className="text-red-400 hover:text-red-600 text-lg leading-none transition-colors"
                              title="Eliminar"
                            ><X size={16} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Extras de pago */}
                    {productExtras.filter(e => !e.es_variante_unica).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-[var(--color-bronce)] tracking-widest mb-1">Extras de pago</p>
                        {productExtras.filter(e => !e.es_variante_unica).map(extra => (
                          <div key={extra.id} className="flex items-center justify-between bg-[var(--color-crema)] border border-[var(--color-gris)]/20 rounded-lg px-3 py-1.5">
                            <div>
                              <span className="text-sm font-semibold text-[var(--color-negro)]">{extra.nombre}</span>
                              <span className="ml-2 text-xs font-bold text-[var(--color-bronce)]">+${extra.precio_adicional}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteExtra(extra.id)}
                              className="text-red-400 hover:text-red-600 text-lg leading-none transition-colors"
                              title="Eliminar"
                            ><X size={16} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add new extra form */}
                <div className="bg-gray-50 border border-dashed border-[var(--color-gris)]/30 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] font-bold uppercase text-[var(--color-gris)] tracking-wider">Agregar extra</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nombre (ej: Shot extra)"
                      value={newExtraName}
                      onChange={e => setNewExtraName(e.target.value)}
                      className="flex-1 h-9 rounded-md border border-[var(--color-gris)]/30 px-3 text-sm focus:ring-1 focus:ring-[var(--color-bronce)] outline-none bg-white"
                    />
                    <input
                      type="number"
                      placeholder="Precio"
                      value={newExtraPrice}
                      onChange={e => setNewExtraPrice(e.target.value)}
                      disabled={newExtraEsVariante}
                      step="0.50"
                      min="0"
                      className="w-24 h-9 rounded-md border border-[var(--color-gris)]/30 px-3 text-sm focus:ring-1 focus:ring-[var(--color-bronce)] outline-none bg-white disabled:opacity-40"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newExtraEsVariante}
                      onChange={e => {
                        setNewExtraEsVariante(e.target.checked)
                        if (e.target.checked) setNewExtraPrice('0')
                      }}
                      className="w-4 h-4 rounded accent-purple-600"
                    />
                    <span className="text-xs text-[var(--color-gris)]">
                      Es opción única (como Caliente/Frío — no suma al precio)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddExtra}
                    disabled={addingExtra || !newExtraName.trim()}
                    className="w-full h-9 rounded-md bg-[var(--color-bronce)] text-white text-sm font-bold tracking-wide disabled:opacity-50 hover:bg-opacity-90 transition-colors"
                  >
                    {addingExtra ? 'Agregando...' : <span className="flex items-center justify-center gap-2"><Plus size={16} /> Agregar extra</span>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Historial de precios ────────────────────────────────────── */}
          {editingProduct && (
            <div className="border-t border-[var(--color-gris)]/20 pt-4">
              <details>
                <summary className="cursor-pointer text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider flex items-center gap-2 list-none">
                  <span>📉 Historial de Precios</span>
                </summary>
                <div className="mt-3">
                  {loadingPriceHistory ? (
                    <p className="text-xs text-[var(--color-gris)]">Cargando...</p>
                  ) : priceHistory.length === 0 ? (
                    <p className="text-xs text-[var(--color-gris)] italic">Sin cambios de precio registrados.</p>
                  ) : (
                    <div className="space-y-1">
                      {priceHistory.map((h: any) => (
                        <div key={h.id} className="flex justify-between items-center text-xs bg-gray-50 rounded px-3 py-1.5">
                          <span className="text-[var(--color-gris)]">{new Date(h.creado_en).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' })}</span>
                          <span>
                            <span className="line-through text-red-400">${h.precio_anterior}</span>
                            <span className="mx-1 text-[var(--color-gris)]">→</span>
                            <span className="font-bold text-green-600">${h.precio_nuevo}</span>
                          </span>
                          <span className="text-[var(--color-gris)]">{h.cambiado_por?.nombre || 'Admin'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          <div className="sticky bottom-[-24px] bg-white p-4 -mx-6 -mb-6 mt-6 border-t border-[var(--color-gris)]/20 z-10">
            <Button type="submit" className="w-full safe-bottom">Guardar Producto</Button>
          </div>
        </form>
      </Modal>

      {/* Category Management Modal */}
      <Modal isOpen={isCategoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="Gestión de Categorías">
        <div className="space-y-4">
          {/* Existing categories list */}
          <div className="space-y-2">
            {categories.length === 0 ? (
              <p className="text-sm text-[var(--color-gris)] italic text-center py-4">No hay categorías aún.</p>
            ) : (
              categories.map((cat: any) => (
                <div key={cat.id} className="flex items-center gap-2 bg-gray-50 border border-[var(--color-gris)]/20 rounded-lg px-3 py-2">
                  {editingCategoryId === cat.id ? (
                    <>
                      <input
                        type="text"
                        value={categoryForm.nombre}
                        onChange={e => setCategoryForm(f => ({ ...f, nombre: e.target.value }))}
                        className="flex-1 h-8 rounded border border-[var(--color-bronce)] px-2 text-sm focus:outline-none"
                        autoFocus
                      />
                      <button
                        className="text-xs font-bold text-white bg-[var(--color-bronce)] px-3 py-1 rounded-md disabled:opacity-50"
                        disabled={savingCategory}
                        onClick={async () => {
                          setSavingCategory(true)
                          await supabase.from('categories').update({
                            nombre: categoryForm.nombre.trim()
                          }).eq('id', cat.id)
                          setSavingCategory(false)
                          setEditingCategoryId(null)
                          loadData()
                        }}
                      >{savingCategory ? '...' : 'Guardar'}</button>
                      {/* <button onClick={() => setEditingCategoryId(null)} className="text-xs text-[var(--color-gris)] px-2 py-1"><X size={14} /></button> */}
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-semibold">{cat.nombre}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cat.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {cat.activo ? 'Activa' : 'Inactiva'}
                      </span>
                      <button
                        onClick={() => { setEditingCategoryId(cat.id); setCategoryForm({ nombre: cat.nombre, orden: String(cat.orden) }) }}
                        className="text-[var(--color-bronce)] hover:opacity-70 transition-opacity text-xs font-bold"
                      >
                        Editar
                      </button>
                      <button
                        onClick={async () => {
                          await supabase.from('categories').update({ activo: !cat.activo }).eq('id', cat.id)
                          loadData()
                        }}
                        className="text-[var(--color-gris)] hover:opacity-70 text-xs"
                      >
                        {cat.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <div className="flex items-center gap-1 border-l border-[var(--color-gris)]/20 pl-2">
                        <button
                          onClick={async () => {
                            const index = categories.findIndex((c: any) => c.id === cat.id)
                            if (index <= 0) return
                            const prev = categories[index - 1]
                            await supabase.from('categories').update({ orden: prev.orden }).eq('id', cat.id)
                            await supabase.from('categories').update({ orden: cat.orden }).eq('id', prev.id)
                            loadData()
                          }}
                          className="text-[var(--color-gris)] hover:text-[var(--color-negro)] disabled:opacity-30"
                          disabled={categories.findIndex((c: any) => c.id === cat.id) <= 0}
                          title="Mover arriba"
                        >▲</button>
                        {/* Creation and Deletion disabled as per fixed 3-category scheme */}
                        {/* <button
                          onClick={async () => {
                            if (confirm('¿Seguro que deseas eliminar esta categoría? (Los productos quedarán sin categoría asignada)')) {
                              await supabase.from('categories').delete().eq('id', cat.id)
                              loadData()
                            }
                          }}
                          className="text-red-500 hover:opacity-70 transition-opacity text-xs font-bold ml-2"
                        >
                          Eliminar
                        </button> */}
                        <button
                          onClick={async () => {
                            const index = categories.findIndex((c: any) => c.id === cat.id)
                            if (index >= categories.length - 1) return
                            const next = categories[index + 1]
                            await supabase.from('categories').update({ orden: next.orden }).eq('id', cat.id)
                            await supabase.from('categories').update({ orden: cat.orden }).eq('id', next.id)
                            loadData()
                          }}
                          className="text-[var(--color-gris)] hover:text-[var(--color-negro)] disabled:opacity-30"
                          disabled={categories.findIndex((c: any) => c.id === cat.id) >= categories.length - 1}
                          title="Mover abajo"
                        >▼</button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Merge categories disabled as per fixed 3-category scheme */}
          {/* Add new category disabled as per fixed 3-category scheme */}
        </div>
      </Modal>

      <Modal isOpen={isEmployeeModalOpen} onClose={() => setEmployeeModalOpen(false)} title={editingEmployee ? "Editar Empleado" : "Nuevo Empleado"}>
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div><label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Nombre</label><Input name="nombre" defaultValue={editingEmployee?.nombre} required /></div>
          <div><label className="block text-xs font-bold text-[var(--color-gris)] mb-1">PIN (4 dígitos)</label><Input name="pin" type="text" maxLength={4} minLength={4} pattern="[0-9]{4}" defaultValue={editingEmployee?.pin} required /></div>
          <div>
            <label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Rol</label>
            <select name="rol" defaultValue={editingEmployee?.rol || 'mesero'} className="h-12 w-full rounded border border-[var(--color-gris)] px-3">
              <option value="mesero">Mesero</option>
              <option value="cocina">Cocina</option>
              <option value="caja">Caja</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {editingEmployee && (
            <div>
              <label className="block text-xs font-bold text-[var(--color-gris)] mb-1">Estado</label>
              <select name="activo" defaultValue={editingEmployee.activo ? 'true' : 'false'} className="h-12 w-full rounded border border-[var(--color-gris)] px-3">
                <option value="true">Activo</option>
                <option value="false">Inactivo (Suspendido)</option>
              </select>
            </div>
          )}
          <div className="sticky bottom-[-24px] bg-white p-4 -mx-6 -mb-6 mt-6 border-t border-[var(--color-gris)]/20 z-10">
            <Button type="submit" className="w-full safe-bottom">Guardar Empleado</Button>
          </div>
        </form>
      </Modal>

      {/* Bottom Nav — mobile only */}
      {/* Bottom Nav Menu (Más) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-[0_-10px_20px_rgba(0,0,0,0.1)] p-4 pb-28 animate-in slide-in-from-bottom-10 duration-200">
            <h3 className="text-[var(--color-bronce)] font-bold mb-4 uppercase tracking-wider text-xs px-2">Más Opciones</h3>
            <div className="grid grid-cols-2 gap-2">
              {TABS.slice(4).map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTab(t.id); setMobileMenuOpen(false) }}
                    className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl font-bold uppercase text-xs text-[var(--color-gris)] hover:bg-[var(--color-crema)] hover:text-[var(--color-bronce)] transition-colors shadow-sm border border-[var(--color-gris)]/10"
                  >
                    <Icon size={18} /> <span className="truncate">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav — mobile only */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-[var(--color-gris)]/20 flex safe-bottom z-50 shadow-[0_-4px_15px_rgba(0,0,0,0.05)]">
        {TABS.slice(0, 4).map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setMobileMenuOpen(false) }}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isActive ? 'text-[var(--color-bronce)] bg-[var(--color-crema)]/30' : 'text-[var(--color-gris)]'
              }`}
            >
              <Icon size={20} />
              <span className="truncate w-full px-1">{t.label}</span>
            </button>
          )
        })}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            mobileMenuOpen ? 'text-[var(--color-bronce)] bg-[var(--color-crema)]/30' : 'text-[var(--color-gris)]'
          }`}
        >
          <MoreHorizontal size={20} />
          <span>Más</span>
        </button>
      </div>
    </div>

    </>
  )
}
