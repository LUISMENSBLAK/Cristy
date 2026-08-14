import { createClient } from '@/utils/supabase/server'
import CocinaView from './CocinaView'
import { redirect } from 'next/navigation'
import { NetworkStatus } from '@/components/NetworkStatus'
import { headers } from 'next/headers'
import Image from 'next/image'

export default async function CocinaPage() {
  const headersList = await headers()
  const headerId = headersList.get('x-employee-id')
  const headerNombre = headersList.get('x-employee-nombre')
  const headerRol = headersList.get('x-employee-rol')

  let employee: { id: string; nombre: string; rol: string }
  const supabase = await createClient()

  if (headerId && headerNombre && headerRol) {
    employee = { id: headerId, nombre: decodeURIComponent(headerNombre), rol: headerRol }
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data } = await supabase
      .from('employees')
      .select('id, nombre, rol')
      .eq('id', user.id)
      .single()

    if (!data) redirect('/login')
    employee = data
  }

  // Fetch all open orders — filter to those with items sent to kitchen
  const { data: allOpenOrders } = await supabase
    .from('orders')
    .select('*, tables(numero), order_items(*, product:products(nombre), extra:product_extras(nombre), creador:employees!order_items_creado_por_fkey(nombre, rol))')
    .eq('estado', 'abierto')
    .order('creado_en', { ascending: true })

  const activeOrders = (allOpenOrders || []).filter(o =>
    o.order_items.some((i: any) => i.enviado_a_cocina && !i.cancelado)
  )

  return (
    <div className="h-dvh bg-[var(--color-crema)] flex flex-col overflow-hidden">
      <NetworkStatus />
      <header className="bg-white border-b border-[var(--color-bronce)]/20 p-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
        <div>
          <Image src="/LogoCristisCofre.png" alt="Cristi's Logo" width={100} height={32} className="h-8 w-auto object-contain bg-transparent" style={{ width: 'auto' }} />
          <p className="text-xs text-[var(--color-gris)] tracking-widest uppercase">Cocina: {employee.nombre}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm font-bold text-red-600 uppercase tracking-wider hover:underline">
            Salir
          </button>
        </form>
      </header>

      <main className="flex-1 min-h-0 p-4 overflow-y-auto">
        <CocinaView initialOrders={activeOrders || []} />
      </main>
    </div>
  )
}
