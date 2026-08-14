'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Note: To create an employee with login, we must create an auth.users record.
// This requires the Service Role Key.
export async function createEmployee(nombre: string, pin: string, rol: string) {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Validate if PIN already exists in employees to prevent collisions
  const { data: existing } = await supabaseAdmin.from('employees').select('id').eq('pin', pin).single()
  if (existing) return { error: 'El PIN ya está en uso' }

  // 1. Create User in Supabase Auth (We don't know the ID yet, so we let Supabase generate it)
  // Email will be a dummy since it's required. We'll use a temporary one, then update it once we have the ID.
  const tempEmail = `temp_${Date.now()}@abaroa.local`
  const internalPassword = `${pin}-abaroa-pos`
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: tempEmail,
    password: internalPassword,
    email_confirm: true
  })

  if (authError) return { error: authError.message }
  if (!authData.user) return { error: 'No user returned' }

  const userId = authData.user.id

  // Update email to the correct format using the ID
  const finalEmail = `emp_${userId}@abaroa.local`
  await supabaseAdmin.auth.admin.updateUserById(userId, { email: finalEmail })

  // 2. Insert into employees table
  const { error: empError } = await supabaseAdmin.from('employees').insert({
    id: userId,
    nombre,
    pin,
    rol,
    activo: true
  })

  if (empError) return { error: empError.message }

  revalidatePath('/admin')
  return { success: true }
}

export async function updateEmployee(id: string, nombre: string, pin: string, rol: string, activo: boolean) {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Validar que el PIN no esté en uso por otro empleado (excluyendo al que se está editando)
  const { data: existing } = await supabaseAdmin
    .from('employees')
    .select('id')
    .eq('pin', pin)
    .neq('id', id)
    .single()

  if (existing) return { error: 'El PIN ya está en uso por otro empleado' }

  // Update employees table
  const { error: empError } = await supabaseAdmin.from('employees').update({
    nombre, pin, rol, activo
  }).eq('id', id)

  if (empError) return { error: empError.message }

  // Update Auth password if PIN changed
  const internalPassword = `${pin}-abaroa-pos`
  await supabaseAdmin.auth.admin.updateUserById(id, { password: internalPassword })

  revalidatePath('/admin')
  return { success: true }
}

export async function deleteEmployee(id: string, currentUserId: string) {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. No permitir que un admin se borre a sí mismo
  if (id === currentUserId) {
    return { error: 'No puedes eliminar tu propia cuenta mientras tienes sesión activa' }
  }

  // 2. No dejar el sistema sin ningún admin activo
  const { data: target } = await supabaseAdmin.from('employees').select('rol, activo').eq('id', id).single()
  if (target?.rol === 'admin') {
    const { count } = await supabaseAdmin.from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('rol', 'admin').eq('activo', true).neq('id', id)
    if (!count || count === 0) {
      return { error: 'No puedes eliminar al único administrador activo' }
    }
  }

  // 3. Verificar si tiene historial (pedidos o movimientos creados)
  const [{ count: ordersCount }, { count: movsCount }] = await Promise.all([
    supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('creado_por', id),
    supabaseAdmin.from('movements').select('*', { count: 'exact', head: true }).eq('creado_por', id)
  ])

  if ((ordersCount || 0) > 0 || (movsCount || 0) > 0) {
    return { error: 'HAS_HISTORY' } // el frontend interpreta este código para ofrecer desactivar en vez de eliminar
  }

  // 4. Sin historial: eliminar de verdad (tabla + usuario de Auth)
  const { error: empError } = await supabaseAdmin.from('employees').delete().eq('id', id)
  if (empError) return { error: empError.message }

  await supabaseAdmin.auth.admin.deleteUser(id)

  revalidatePath('/admin')
  return { success: true }
}
