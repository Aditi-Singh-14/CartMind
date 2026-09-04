'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabase/client';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      const { data, error } = await supabaseClient
        .from('orders')
        .select(`
          id,
          razorpay_order_id,
          total_amount,
          status,
          created_at,
          order_items (
            id,
            quantity,
            unit_price,
            products (
              name,
              category
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setOrders(data);
      }
      setLoading(false);
    }
    fetchOrders();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          My Order History
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          View your past orders, line items, and Razorpay checkout references.
        </p>
      </div>

      {loading ? (
        <div className="mt-12 text-center text-xs text-slate-500">
          Loading order history...
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <p className="text-sm font-semibold text-slate-600">No orders found.</p>
          <p className="mt-1 text-xs text-slate-400">
            Place an order from the Catalog to see it recorded here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-500 font-medium">Order ID</span>
                    <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {order.id.substring(0, 13)}...
                    </span>
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">
                      {order.status}
                    </span>
                  </div>
                  {order.razorpay_order_id && (
                    <p className="mt-1 text-xs text-slate-500 font-mono">
                      Razorpay Order ID: <span className="text-blue-600 font-bold">{order.razorpay_order_id}</span>
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Total Paid</span>
                  <p className="text-lg font-extrabold text-slate-900">
                    ₹{(order.total_amount / 100).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {new Date(order.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Line Items ({order.order_items?.length || 0})
                </h4>
                <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                  {order.order_items?.map((item: any) => {
                    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">
                            {prod?.name || 'Product'}
                          </span>
                          {prod?.category && (
                            <span className="ml-2 text-[10px] text-slate-500 font-mono">
                              ({prod.category})
                            </span>
                          )}
                        </div>
                        <div className="text-slate-600 font-semibold">
                          Qty: {item.quantity} × ₹{(item.unit_price / 100).toLocaleString('en-IN')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
