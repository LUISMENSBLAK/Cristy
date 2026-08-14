import { useState, useEffect } from 'react'
import type { CartItem } from '@/components/POSMenu'

export function useCartState(storageKey: string) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderType, setOrderType] = useState('mesa')
  const [selectedTable, setSelectedTable] = useState('')
  const [nombreCliente, setNombreCliente] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.cart) setCart(parsed.cart)
        if (parsed.orderType) setOrderType(parsed.orderType)
        if (parsed.selectedTable) setSelectedTable(parsed.selectedTable)
        if (parsed.nombreCliente) setNombreCliente(parsed.nombreCliente)
      }
    } catch (e) {
      console.warn('Error loading cart state from sessionStorage', e)
    }
    setIsLoaded(true)
  }, [storageKey])

  // Save to sessionStorage whenever state changes (if loaded)
  useEffect(() => {
    if (!isLoaded) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        cart,
        orderType,
        selectedTable,
        nombreCliente
      }))
    } catch (e) {
      console.warn('Error saving cart state to sessionStorage', e)
    }
  }, [cart, orderType, selectedTable, nombreCliente, isLoaded, storageKey])

  // Clear cart (used after successful order)
  const clearCart = () => {
    setCart([])
    setOrderType('mesa')
    setSelectedTable('')
    setNombreCliente('')
    sessionStorage.removeItem(storageKey)
  }

  return {
    cart, setCart,
    orderType, setOrderType,
    selectedTable, setSelectedTable,
    nombreCliente, setNombreCliente,
    clearCart
  }
}
