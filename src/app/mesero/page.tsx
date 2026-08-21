import { createClient } from '@/utils/supabase/server'
import MeseroView from './MeseroView'
import { redirect } from 'next/navigation'
import { NetworkStatus } from '@/components/NetworkStatus'
import { headers } from 'next/headers'
import Image from 'next/image'

export default async function MeseroPage() {
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

  // Fetch active products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('activo', true)
    .order('categoria')

  // Fetch active extras
  const { data: extras } = await supabase
    .from('product_extras')
    .select('*')
    .eq('activo', true)

  // Fetch active product ingredients
  const { data: ingredients } = await supabase
    .from('product_ingredients')
    .select('*')
    .eq('activo', true)

  // Fetch tables
  const { data: _tables } = await supabase
    .from('tables')
    .select('*')
  const tables = (_tables || []).sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))

  // Fetch categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('orden')

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()

  // Fetch currently open orders for this Mesero (to allow editing before closing)
  // We'll fetch all open orders for now so they can view/edit active tables
  const { data: activeOrders } = await supabase
    .from('orders')
    .select('*, order_items(*, product:products(*))')
    .eq('estado', 'abierto')
    .order('creado_en', { ascending: false })

  return (
    <div className="h-dvh bg-[var(--color-crema)] flex flex-col overflow-hidden">
      <NetworkStatus />
      <header className="bg-white border-b border-[var(--color-bronce)]/20 py-2 px-4 flex justify-between items-center shadow-sm sticky top-0 z-10">
        <div>
          <Image src="/LogoCristisCofre.png" alt="Cristi's Logo" width={100} height={32} className="h-8 w-auto object-contain bg-transparent" style={{ width: 'auto' }} />
          <p className="text-xs text-[var(--color-gris)] tracking-widest uppercase">Mesero: {employee.nombre}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm font-bold text-red-600 uppercase tracking-wider hover:underline">
            Salir
          </button>
        </form>
      </header>

      <main className="flex-1 min-h-0 px-4 pb-4 pt-2 overflow-hidden">
        <MeseroView 
          products={products || []}
          extras={extras || []}
          ingredients={ingredients || []}
          tables={tables || []} 
          initialActiveOrders={activeOrders || []}
          employeeId={employee.id}
          employeeName={employee.nombre}
          categoriesList={categories || []}
          settings={settings}
        />
      </main>
    </div>
  )
}
