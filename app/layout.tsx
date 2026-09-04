import './globals.css';
import type { Metadata } from 'next';
import { CartProvider } from '@/context/CartContext';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'CartMind - AI Cart Optimization Platform',
  description: 'AI-Powered Margin-Aware Upselling & Smart Replenishment',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased">
        <CartProvider>
          <Navbar />
          <div className="flex-1">{children}</div>
        </CartProvider>
      </body>
    </html>
  );
}
