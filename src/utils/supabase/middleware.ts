import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user && pathname !== '/login' && !pathname.startsWith('/_next') && !pathname.includes('.')) {
    // Not logged in, redirect to login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If logged in, fetch employee role from database to protect routes
  if (user) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id, nombre, rol, activo')
      .eq('id', user.id)
      .single()

    if (!employee || !employee.activo) {
      // User is disabled or not found in employees, force logout and redirect to login
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Role-based routing protection
    const role = employee.rol; // 'mesero' | 'cocina' | 'caja' | 'admin'

    // Prevent access to wrong dashboards
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = `/${role}`
      return NextResponse.redirect(url)
    }

    if (pathname.startsWith('/mesero') && role !== 'mesero' && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = `/${role}`
      return NextResponse.redirect(url)
    }

    if (pathname.startsWith('/cocina') && role !== 'cocina' && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = `/${role}`
      return NextResponse.redirect(url)
    }

    if (pathname.startsWith('/caja') && role !== 'caja' && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = `/${role}`
      return NextResponse.redirect(url)
    }

    if (pathname.startsWith('/admin') && role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = `/${role}`
      return NextResponse.redirect(url)
    }

    if (pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = `/${role}`
      return NextResponse.redirect(url)
    }

    // Set employee headers on the request
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-employee-id', employee.id)
    requestHeaders.set('x-employee-rol', employee.rol)
    requestHeaders.set('x-employee-nombre', encodeURIComponent(employee.nombre))

    // Preserve cookies set by Supabase auth during this request
    const previousCookies = supabaseResponse.cookies.getAll()

    // Create a new response using the modified request headers
    supabaseResponse = NextResponse.next({
      request: { headers: requestHeaders },
    })

    // Re-apply the cookies to the new response
    previousCookies.forEach(cookie => {
      supabaseResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
  }

  return supabaseResponse
}
