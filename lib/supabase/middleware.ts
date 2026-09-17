import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * @param baseResponse Optional response object to mutate/return instead of
 *   constructing a fresh `NextResponse.next()`. Passed by the composed
 *   middleware for the public/locale-prefixed branch so next-intl's
 *   `x-middleware-rewrite` header (set on the response BEFORE this function
 *   runs) survives — recreating the response here would silently drop it
 *   (see middleware.ts Pattern 1 composition). Non-localized call sites
 *   (/admin, /driver) never pass this and get byte-identical behavior.
 * @param pathnameOverride Optional locale-stripped pathname (e.g.
 *   '/ru/account' -> '/account') used ONLY for the /account redirect-gate
 *   check below, so a locale-prefixed public route is still gated
 *   correctly. The /admin checks intentionally keep using the RAW
 *   `request.nextUrl.pathname` — /admin is never locale-prefixed (excluded
 *   from next-intl routing entirely), so using the raw pathname there
 *   prevents a probe like /ru/admin from ever matching admin logic (T-68-04).
 */
export async function updateSession(
  request: NextRequest,
  extraReqHeaders?: Headers,
  baseResponse?: NextResponse,
  pathnameOverride?: string
) {
  // Merge any extra headers (e.g. x-nonce) so server components can read them
  // via headers(). Using { request: { headers } } is the Next.js-supported way
  // to forward custom headers to route handlers and Server Components.
  const reqHeaders = extraReqHeaders ?? new Headers(request.headers)
  let response = baseResponse ?? NextResponse.next({ request: { headers: reqHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Only recreate the response when no base response was supplied
          // (default/non-localized call sites, byte-identical to before).
          // When composing with next-intl, write cookies onto the SAME
          // baseResponse object — recreating it here would drop the
          // x-middleware-rewrite header set by handleI18nRouting.
          if (!baseResponse) {
            response = NextResponse.next({ request: { headers: reqHeaders } })
          }
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() validates JWT with auth server — never use getSession()
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const gatedPathname = pathnameOverride ?? pathname

  // NEW: authenticated NON-admin requesting /admin/* (except /admin/login) → home (D-11)
  // Raw pathname on purpose — see pathnameOverride doc comment above.
  if (
    pathname.startsWith('/admin') &&
    pathname !== '/admin/login' &&
    user &&
    !user.app_metadata?.is_admin
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Unauthenticated → redirect to login (exclude /admin/login to prevent infinite loop)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  // Authenticated on login page → redirect to /admin
  if (pathname === '/admin/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    return NextResponse.redirect(url)
  }

  // NEW: unauthenticated customer requesting /account/* → /login with return-to (D-12)
  // Uses the (possibly locale-stripped) gatedPathname for the check, but the
  // returnTo target keeps the RAW pathname so /ru/account redirects back to
  // /ru/account, not /account.
  if (gatedPathname.startsWith('/account') && !user) {
    const url = request.nextUrl.clone()
    const returnTo = encodeURIComponent(pathname + request.nextUrl.search)
    url.pathname = '/login'
    url.search = `?return-to=${returnTo}`
    return NextResponse.redirect(url)
  }

  return response
}
