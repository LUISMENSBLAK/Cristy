import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    return NextResponse.redirect(new URL('/', request.url), {
      status: 302,
    })
  }

  revalidatePath('/', 'layout')
  return NextResponse.redirect(new URL('/login', request.url), {
    status: 302,
  })
}
