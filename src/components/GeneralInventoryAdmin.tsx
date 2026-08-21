'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Plus, Package, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Product = {
  id: string
  nombre: string
  categoria: string
  stock_actual: number | null
  stock_minimo: number | null
  maneja_inventario: boolean
  unidades_por_carton: number
  activo: boolean
}

type StockModal = {
  product: Product
  mode: 'cajas' | 'sueltas'
  amount: string
}

export default function GeneralInventoryAdmin() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [stockModal, setStockModal] = useState<StockModal | null>(null)
  const [saving, setSaving] = useState(false)

  // For enabling inventory on a product
  const [enableModal, setEnableModal] = useState<{product: Product} | null>(null)
  const [enableStock, setEnableStock] = useState('0')
  const [enableMinimo, setEnableMinimo] = useState('5')
  const [enableCarton, setEnableCarton] = useState('1')
  const [enableCajas, setEnableCajas] = useState('0')
  const [enableSueltas, setEnableSueltas] = useState('0')
  const [enablingId, setEnablingId] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, nombre, categoria, stock_actual, stock_minimo, maneja_inventario, unidades_por_carton, activo')
      .eq('activo', true)
      .order('categoria')
      .order('nombre')
    setProducts(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadProducts() }, [loadProducts])

  const inventoryProducts = products.filter(p => p.maneja_inventario)
  const noInventoryProducts = products.filter(p => !p.maneja_inventario)

  const stockColor = (p: Product) => {
    const s = p.stock_actual ?? 0
    const min = p.stock_minimo ?? 5
    if (s <= 0) return 'bg-red-100 text-red-700 border-red-200'
    if (s <= min) return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-green-100 text-green-700 border-green-200'
  }

  const addedUnits = stockModal
    ? stockModal.mode === 'cajas'
      ? (parseInt(stockModal.amount) || 0) * (stockModal.product.unidades_por_carton || 1)
      : (parseInt(stockModal.amount) || 0)
    : 0

  const handleAddStock = async () => {
    if (!stockModal || addedUnits <= 0) return
    setSaving(true)
    const p = stockModal.product
    const newStock = (p.stock_actual ?? 0) + addedUnits
    const { error } = await supabase
      .from('products')
      .update({ stock_actual: newStock })
      .eq('id', p.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    setStockModal(null)
    loadProducts()
  }

  const handleEnableInventory = async () => {
    if (!enableModal) return
    setEnablingId(enableModal.product.id)
    const cpc = Math.max(1, parseInt(enableCarton) || 1)
    const stockTotal = cpc > 1
      ? (parseInt(enableCajas) || 0) * cpc + (parseInt(enableSueltas) || 0)
      : parseInt(enableStock) || 0
    const { error } = await supabase
      .from('products')
      .update({
        maneja_inventario: true,
        stock_actual: stockTotal,
        stock_minimo: parseInt(enableMinimo) || 5,
        unidades_por_carton: cpc,
      })
      .eq('id', enableModal.product.id)
    setEnablingId(null)
    if (error) { alert(error.message); return }
    setEnableModal(null)
    loadProducts()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-[var(--color-gris)]">
      <Package className="animate-pulse mr-2" size={20} /> Cargando inventario...
    </div>
  )

  return (
    <div className="space-y-8">
      {/* ── Productos ya bajo control ─────────────────────────────── */}
      <div>
        <h3 className="font-serif font-bold text-xl text-[var(--color-negro)] mb-4 flex items-center gap-2">
          <Package size={20} className="text-[var(--color-bronce)]" />
          Bajo control de inventario
          <span className="text-sm font-normal text-[var(--color-gris)] ml-1">({inventoryProducts.length})</span>
        </h3>

        {inventoryProducts.length === 0 ? (
          <div className="bg-[var(--color-crema)] rounded-xl p-8 text-center text-[var(--color-gris)]">
            Ningún producto tiene el inventario activado aún.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-center">Stock actual</th>
                  <th className="px-4 py-3 text-center">Equivalencia</th>
                  <th className="px-4 py-3 text-center">Mínimo</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inventoryProducts.map(p => {
                  const stock = p.stock_actual ?? 0
                  const cpc = p.unidades_por_carton || 1
                  const cajas = Math.floor(stock / cpc)
                  const sueltas = stock % cpc
                  const low = stock <= (p.stock_minimo ?? 5)
                  return (
                    <tr key={p.id} className={`border-b border-[var(--color-gris)]/10 hover:bg-gray-50 ${low ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-4 py-3 font-medium">
                        {low && <AlertTriangle size={12} className="inline mr-1 text-amber-600" />}
                        {p.nombre}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-gris)]">{p.categoria || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${stockColor(p)}`}>
                          {stock} {stock === 1 ? 'ud.' : 'uds.'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-[var(--color-gris)]">
                        {cpc > 1 ? (
                          <span>{cajas > 0 ? `${cajas} caja${cajas > 1 ? 's' : ''}` : ''}{cajas > 0 && sueltas > 0 ? ' + ' : ''}{sueltas > 0 ? `${sueltas} sueltas` : ''}{cajas === 0 && sueltas === 0 ? '0' : ''}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--color-gris)]">
                        {p.stock_minimo ?? 5}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--color-crema)] text-[var(--color-bronce)] border border-[var(--color-bronce)]/30 hover:bg-[var(--color-bronce)] hover:text-white transition-colors"
                          onClick={() => setStockModal({ product: p, mode: 'cajas', amount: '' })}
                        >
                          <Plus size={12} /> Agregar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Productos sin control ────────────────────────────────── */}
      {noInventoryProducts.length > 0 && (
        <div>
          <h3 className="font-serif font-bold text-xl text-[var(--color-negro)] mb-4 flex items-center gap-2">
            Activar inventario en producto
            <span className="text-sm font-normal text-[var(--color-gris)] ml-1">({noInventoryProducts.length} sin control)</span>
          </h3>
          <div className="bg-white rounded-xl border border-[var(--color-gris)]/20 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-[var(--color-crema)] text-[var(--color-gris)] text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {noInventoryProducts.map(p => (
                  <tr key={p.id} className="border-b border-[var(--color-gris)]/10 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.nombre}</td>
                    <td className="px-4 py-3 text-[var(--color-gris)]">{p.categoria || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-xs font-bold px-3 py-1.5 rounded-lg text-[var(--color-gris)] border border-[var(--color-gris)]/30 hover:border-[var(--color-bronce)] hover:text-[var(--color-bronce)] transition-colors"
                        onClick={() => {
                          setEnableModal({ product: p })
                          setEnableStock('0')
                          setEnableMinimo('5')
                          setEnableCarton('1')
                          setEnableCajas('0')
                          setEnableSueltas('0')
                        }}
                      >
                        + Activar control
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal agregar existencias ────────────────────────────── */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <h3 className="font-serif font-bold text-lg text-[var(--color-negro)]">
              Agregar existencias
            </h3>
            <p className="text-sm text-[var(--color-gris)]">
              <span className="font-bold text-[var(--color-negro)]">{stockModal.product.nombre}</span>
              <br />Stock actual: <strong>{stockModal.product.stock_actual ?? 0} uds.</strong>
            </p>

            {/* Mode selector */}
            <div className="flex gap-2">
              <button
                className={`flex-1 py-2 text-sm rounded-lg border font-bold transition-colors ${stockModal.mode === 'cajas' ? 'bg-[var(--color-bronce)] text-white border-[var(--color-bronce)]' : 'border-[var(--color-gris)]/30 text-[var(--color-gris)]'}`}
                onClick={() => setStockModal(m => m ? { ...m, mode: 'cajas', amount: '' } : m)}
              >
                📦 Cajas
              </button>
              <button
                className={`flex-1 py-2 text-sm rounded-lg border font-bold transition-colors ${stockModal.mode === 'sueltas' ? 'bg-[var(--color-bronce)] text-white border-[var(--color-bronce)]' : 'border-[var(--color-gris)]/30 text-[var(--color-gris)]'}`}
                onClick={() => setStockModal(m => m ? { ...m, mode: 'sueltas', amount: '' } : m)}
              >
                🔢 Unidades sueltas
              </button>
            </div>

            {stockModal.product.unidades_por_carton > 1 && (
              <p className="text-xs text-[var(--color-gris)]">
                {stockModal.product.unidades_por_carton} unidades por caja
              </p>
            )}

            <div>
              <label className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider block mb-1">
                {stockModal.mode === 'cajas' ? 'Número de cajas' : 'Número de unidades'}
              </label>
              <input
                type="number"
                min="1"
                className="w-full h-12 px-4 rounded-lg border border-[var(--color-gris)]/30 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)]"
                placeholder="0"
                value={stockModal.amount}
                onChange={e => setStockModal(m => m ? { ...m, amount: e.target.value } : m)}
                autoFocus
              />
            </div>

            {addedUnits > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-bold">
                ✅ Se sumarán <strong>{addedUnits} unidades</strong>
                {' '}→ Nuevo stock: <strong>{(stockModal.product.stock_actual ?? 0) + addedUnits}</strong>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                className="flex-1 py-3 rounded-lg border border-[var(--color-gris)]/30 text-[var(--color-gris)] font-bold hover:bg-gray-50 transition-colors"
                onClick={() => setStockModal(null)}
              >
                Cancelar
              </button>
              <Button
                className="flex-1"
                disabled={addedUnits <= 0 || saving}
                onClick={handleAddStock}
              >
                {saving ? 'Guardando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal activar control de inventario ────────────────── */}
      {enableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <h3 className="font-serif font-bold text-lg text-[var(--color-negro)]">
              Activar control de inventario
            </h3>
            <p className="text-[var(--color-bronce)] font-bold">{enableModal.product.nombre}</p>

            <div className="space-y-4">
              {/* 1. Unidades por caja — siempre primero */}
              <div>
                <label className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider block mb-1">
                  Unidades por caja/cartón <span className="font-normal">(deja 1 si no aplica)</span>
                </label>
                <input
                  type="number" min="1"
                  className="w-full h-11 px-3 rounded-lg border border-[var(--color-gris)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)]"
                  value={enableCarton}
                  onChange={e => { setEnableCarton(e.target.value); setEnableCajas('0'); setEnableSueltas('0'); setEnableStock('0') }}
                />
              </div>

              {/* 2a. Si unidades/caja > 1: campos de cajas + sueltas */}
              {(parseInt(enableCarton) || 1) > 1 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider block mb-1">
                        Cajas completas
                      </label>
                      <input
                        type="number" min="0"
                        className="w-full h-11 px-3 rounded-lg border border-[var(--color-gris)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)]"
                        value={enableCajas}
                        onChange={e => setEnableCajas(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider block mb-1">
                        Unidades sueltas
                      </label>
                      <input
                        type="number" min="0"
                        className="w-full h-11 px-3 rounded-lg border border-[var(--color-gris)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)]"
                        value={enableSueltas}
                        onChange={e => setEnableSueltas(e.target.value)}
                      />
                    </div>
                  </div>
                  {((parseInt(enableCajas) || 0) > 0 || (parseInt(enableSueltas) || 0) > 0) && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 font-bold">
                      ✅ Se activará con <strong>
                        {(parseInt(enableCajas) || 0) * (parseInt(enableCarton) || 1) + (parseInt(enableSueltas) || 0)}
                      </strong> unidades en total
                    </div>
                  )}
                </>
              ) : (
                /* 2b. Sin empaque por caja: solo un campo simple */
                <div>
                  <label className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider block mb-1">
                    Stock inicial (unidades)
                  </label>
                  <input
                    type="number" min="0"
                    className="w-full h-11 px-3 rounded-lg border border-[var(--color-gris)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)]"
                    value={enableStock}
                    onChange={e => setEnableStock(e.target.value)}
                  />
                </div>
              )}

              {/* 3. Stock mínimo — siempre */}
              <div>
                <label className="text-xs font-bold text-[var(--color-gris)] uppercase tracking-wider block mb-1">
                  Stock mínimo (alerta)
                </label>
                <input
                  type="number" min="0"
                  className="w-full h-11 px-3 rounded-lg border border-[var(--color-gris)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)]"
                  value={enableMinimo}
                  onChange={e => setEnableMinimo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                className="flex-1 py-3 rounded-lg border border-[var(--color-gris)]/30 text-[var(--color-gris)] font-bold hover:bg-gray-50 transition-colors"
                onClick={() => setEnableModal(null)}
              >
                Cancelar
              </button>
              <Button
                className="flex-1"
                disabled={!!enablingId}
                onClick={handleEnableInventory}
              >
                {enablingId ? 'Activando...' : 'Activar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
