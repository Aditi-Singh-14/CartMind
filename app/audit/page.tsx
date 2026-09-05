'use client';

import { useState, useEffect } from 'react';

export default function AuditPage() {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersTotalPaise, setOrdersTotalPaise] = useState(0);

  const [isMerchant, setIsMerchant] = useState<boolean | null>(null);

  useEffect(() => {
    async function fetchAuditData() {
      try {
        const res = await fetch('/api/audit');
        if (res.status === 403 || res.status === 401) {
          setIsMerchant(false);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setDecisions(data);
          setIsMerchant(true);
        } else {
          setIsMerchant(false);
        }
      } catch (e) {
        console.error('Error fetching audit data:', e);
        setIsMerchant(false);
      } finally {
        setLoading(false);
      }
    }
    fetchAuditData();

    // Fetch orders total for revenue stat cards
    fetch('/api/audit/orders-total')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.total_amount_paise != null) setOrdersTotalPaise(d.total_amount_paise); })
      .catch(() => {});
  }, []);

  const totalDecisions = decisions.length;
  const approvedDecisions = decisions.filter((d) => d.user_response === 'approved').length;
  const boundInterceptions = decisions.filter((d) => d.bound_check_passed === false).length;
  const totalRevenuePaise = decisions.reduce(
    (sum, d) => sum + (d.user_response === 'approved' ? Number(d.revenue_delta || 0) : 0),
    0
  );

  const upsellPct =
    ordersTotalPaise > 0
      ? Math.round((totalRevenuePaise / ordersTotalPaise) * 100)
      : 0;

  if (!loading && isMerchant === false) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-10 shadow-2xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-3xl text-rose-400">
            🔒
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">403 Access Denied</h1>
          <p className="mt-2 text-sm text-slate-300">
            The Merchant Audit layer is restricted to merchant administrator accounts only.
          </p>
          <a
            href="/catalog"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
          >
            Return to Product Catalog
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Merchant Trust Layer Banner */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Merchant Agent Audit Layer
            </h1>
            <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-700">
              Merchant View
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Real-time audit log of all AI agent recommendation decisions, safety bound checks, and MCP checkout results.
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Agent Decisions
          </span>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">{totalDecisions}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Approved Conversions
          </span>
          <p className="mt-2 text-3xl font-extrabold text-emerald-600">
            {approvedDecisions}{' '}
            <span className="text-sm font-medium text-slate-500">
              ({totalDecisions > 0 ? Math.round((approvedDecisions / totalDecisions) * 100) : 0}%)
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Total Revenue Delta (Upsells)
          </span>
          <p className="mt-2 text-3xl font-black text-amber-600">
            +₹{(totalRevenuePaise / 100).toLocaleString('en-IN')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Bound Check Interceptions
          </span>
          <p className="mt-2 text-3xl font-extrabold text-rose-600">
            {boundInterceptions}
          </p>
        </div>

        {/* New: Total Revenue */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            Total Revenue
          </span>
          <p className="mt-2 text-3xl font-black text-emerald-700">
            ₹{(ordersTotalPaise / 100).toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">orders: created + paid</p>
        </div>

        {/* New: % From AI Upsells */}
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-5 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-violet-700">
            % From AI Upsells
          </span>
          <p className="mt-2 text-3xl font-black text-violet-700">
            {upsellPct}%
          </p>
          <p className="mt-1 text-[10px] text-slate-400">revenue delta ÷ total revenue</p>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="mt-8">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          Agent Decision Trajectory &amp; Trust Logs
        </h2>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Loading audit decision logs...
          </div>
        ) : decisions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500 shadow-xs">
            No agent decisions recorded yet. Run recommendations from Checkout to populate logs.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3.5">Timestamp</th>
                    <th className="px-4 py-3.5">Customer</th>
                    <th className="px-4 py-3.5">Signal</th>
                    <th className="px-4 py-3.5">Candidate Item</th>
                    <th className="px-4 py-3.5">Bound Check Rule</th>
                    <th className="px-4 py-3.5">User Action</th>
                    <th className="px-4 py-3.5">Final Status</th>
                    <th className="px-4 py-3.5 text-right">Revenue Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {decisions.map((d) => {
                    const customerName = d.customers?.name || d.customer_id.substring(0, 8);
                    const candidateName = d.products?.name || d.candidate_item_id || 'None';
                    const candidatePrice = d.products?.price ? d.products.price / 100 : 0;

                    return (
                      <tr key={d.id} className="hover:bg-slate-50 transition">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 font-mono text-[11px]">
                          {new Date(d.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-slate-900 font-bold">
                          {customerName}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              d.signal_type === 'replenishment'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {d.signal_type || 'n/a'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-900 font-semibold">
                          <div>{candidateName}</div>
                          {candidatePrice > 0 && (
                            <div className="text-[10px] text-slate-500">
                              ₹{candidatePrice.toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px] max-w-xs truncate">
                          <span
                            className={
                              d.bound_check_passed
                                ? 'text-emerald-700 font-bold'
                                : 'text-rose-600 font-bold'
                            }
                          >
                            {d.bound_check_rule}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`rounded-md px-2 py-1 text-[10px] font-extrabold ${
                              d.user_response === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : d.user_response === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {d.user_response}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-600">
                          {d.final_status}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-amber-600">
                          {d.revenue_delta ? `+₹${(d.revenue_delta / 100).toLocaleString('en-IN')}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
