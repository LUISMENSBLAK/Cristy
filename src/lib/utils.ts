/**
 * Traduce el campo `tipo` de una orden al texto legible en español.
 */
export function formatOrderType(tipo: string): string {
  const labels: Record<string, string> = {
    para_llevar: 'Para llevar',
    a_domicilio: 'A domicilio',
    domicilio: 'A domicilio',
    mesa: 'Mesa',
  }
  return labels[tipo] ?? tipo
}

/**
 * Devuelve clases CSS de color según el tipo de pedido.
 * Domicilio → azul, Para llevar → rojo, Mesa → sin color extra.
 */
export function getOrderTypeColorClass(tipo: string): string {
  if (tipo === 'domicilio' || tipo === 'a_domicilio') return 'text-blue-600'
  if (tipo === 'para_llevar') return 'text-red-600'
  return ''
}
