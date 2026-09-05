import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Allow public routes
  const isPublicRoute =
    path === '/login' ||
    path === '/signup' ||
    path.startsWith('/api/catalog') ||
    path.startsWith('/api/voice-intent') ||
    path.startsWith('/api/audit') ||
    path.startsWith('/api/recommend') ||
    path.startsWith('/api/decisions') ||
    path.startsWith('/api/checkout') ||
    path.startsWith('/_next') ||
    path.includes('/favicon.ico');

  if (!user && !isPublicRoute) {
    // Redirect unauthenticated users to /login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && (path === '/login' || path === '/signup')) {
    // Redirect logged-in users to /catalog
    const url = request.nextUrl.clone();
    url.pathname = '/catalog';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
