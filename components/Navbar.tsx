'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { supabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartItemCount } = useCart();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isMerchant, setIsMerchant] = useState<boolean>(false);

  useEffect(() => {
    async function checkAuthAndMerchant() {
      const { data } = await supabaseClient.auth.getUser();
      setUserEmail(data.user?.email || null);
      setIsMerchant(data.user?.user_metadata?.is_merchant === true);
    }

    checkAuthAndMerchant();

    const { data: listener } = supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      setUserEmail(session?.user?.email || null);
      setIsMerchant(session?.user?.user_metadata?.is_merchant === true);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Hide nav on login/signup pages
  if (pathname === '/login' || pathname === '/signup') {
    return null;
  }

  const navLinks = [
    { name: 'Catalog', href: '/catalog' },
    { name: 'Checkout', href: '/checkout', badge: cartItemCount },
    { name: 'Orders', href: '/orders' },
    ...(isMerchant ? [{ name: 'Merchant Audit', href: '/audit' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center space-x-8">
          <Link href="/catalog" className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-extrabold text-white shadow-md shadow-blue-500/20">
              CM
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Cart<span className="text-blue-600">Mind</span>
            </span>
          </Link>

          <nav className="hidden space-x-1 md:flex">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {link.name}
                  {link.badge !== undefined && link.badge > 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white shadow-xs">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {userEmail ? (
            <div className="flex items-center space-x-3">
              <span className="hidden text-xs font-medium text-slate-500 sm:inline bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                {userEmail}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
