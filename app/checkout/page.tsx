'use client';

import Script from 'next/script';
import { useState, useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { supabaseClient } from '@/lib/supabase/client';
import VoiceInput from '@/components/VoiceInput';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage() {
  const { cart, addToCart, removeFromCart, clearCart, cartTotalPaise } = useCart();
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recList, setRecList] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<any | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [agentReasoningSteps, setAgentReasoningSteps] = useState<Array<{ step: string; detail: string }>>([]);
  const [textQueryInput, setTextQueryInput] = useState<string>('');
  const [isAgentExecuting, setIsAgentExecuting] = useState<boolean>(false);
  const [showTrace, setShowTrace] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Shipping Address Form State
  const [shippingAddress, setShippingAddress] = useState({
    fullName: '',
    addressLine: '123 MG Road, Suite 400',
    city: 'Bengaluru',
    pincode: '560001'
  });

  useEffect(() => {
    async function fetchCustomer() {
      const { data: authData } = await supabaseClient.auth.getUser();
      if (authData.user) {
        const { data: cust } = await supabaseClient
          .from('customers')
          .select('id, name')
          .eq('user_id', authData.user.id)
          .single();

        if (cust) {
          setCustomer(cust);
        }
      }
    }
    fetchCustomer();
  }, []);

  // Stable string key from cart contents — avoids infinite cancel/restart
  // caused by the cart array getting a new reference on every CartContext render.
  const cartKey = cart
    .map((item) => `${item.product.id}:${item.quantity}`)
    .sort()
    .join(',');

  // Auto-fetch recommendations whenever cart contents change (debounced 500ms)
  useEffect(() => {
    if (!cartKey) {
      setRecList([]);
      return;
    }

    const timer = setTimeout(async () => {
      setRecLoading(true);
      setError(null);

      try {
        const cartProductIds = cart.map((item) => item.product.id);
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart: cartProductIds }),
        });

        const data = await res.json();
        if (!res.ok) {
          // Surface auth errors so they're not silently swallowed
          if (res.status === 401 || res.status === 403) {
            console.warn('Recommendations require login:', data.error);
            return; // Don't show error to customer, just skip
          }
          throw new Error(data.error || 'Failed to fetch recommendations');
        }

        if (Array.isArray(data.recommendations)) {
          setRecList(data.recommendations);
        } else if (data.candidate) {
          setRecList([data]);
        } else {
          setRecList([]);
        }
      } catch (err: any) {
        console.error('Auto-recommendation error:', err);
        setRecList([]);
      } finally {
        setRecLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey]);

  // Open Razorpay hosted checkout modal with order details
  const triggerRazorpayCheckout = (orderData: any, decisionId: string | null, preferredMethod?: string) => {
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TXglYk7R8hvP5j';

    const options: any = {
      key: key,
      amount: orderData.total_amount,
      currency: 'INR',
      name: 'CartMind Store',
      description: 'AI Cart Optimization Checkout',
      order_id: orderData.razorpay_order_id,
      prefill: {
        name: shippingAddress.fullName || customer?.name || 'Customer',
        contact: '9999999999',
        method: preferredMethod === 'netbanking' ? 'netbanking' : preferredMethod === 'upi' ? 'upi' : preferredMethod === 'card' ? 'card' : undefined
      },
      config: preferredMethod && preferredMethod !== 'default' ? {
        display: {
          blocks: {
            preferred: {
              name: `Pay using ${preferredMethod.toUpperCase()}`,
              instruments: [{ method: preferredMethod }]
            }
          },
          sequence: ['block.preferred']
        }
      } : undefined,
      theme: {
        color: '#2563eb'
      },
      handler: async function (response: any) {
        // Payment success callback
        try {
          await fetch('/api/pay-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: orderData.razorpay_order_id,
              decision_id: decisionId,
              status: 'payment_completed',
              payment_id: response.razorpay_payment_id,
              shipping_address: shippingAddress
            })
          });

          setOrderConfirmation({
            ...orderData,
            final_status: 'payment_completed',
            payment_id: response.razorpay_payment_id,
            shipping_address: shippingAddress
          });
          clearCart();
          setRecList([]);
        } catch (e: any) {
          console.error('Error updating payment status:', e);
        } finally {
          setActionLoadingId(null);
        }
      },
      modal: {
        ondismiss: async function () {
          // User closed checkout without completing payment
          try {
            await fetch('/api/pay-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: orderData.razorpay_order_id,
                decision_id: decisionId,
                status: 'payment_failed',
                shipping_address: shippingAddress
              })
            });

            setError('Payment cancelled or closed. Order saved as payment_failed (retry available).');
          } catch (e: any) {
            console.error('Error updating payment failure:', e);
          } finally {
            setActionLoadingId(null);
          }
        }
      }
    };

    if (window.Razorpay) {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async function (response: any) {
        await fetch('/api/pay-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: orderData.razorpay_order_id,
            decision_id: decisionId,
            status: 'payment_failed',
            shipping_address: shippingAddress
          })
        });
        setError(`Payment failed: ${response.error?.description || 'Transaction declined'}`);
        setActionLoadingId(null);
      });
      rzp.open();
    } else {
      // Fallback if Razorpay SDK fails to load
      setOrderConfirmation(orderData);
      clearCart();
      setRecList([]);
      setActionLoadingId(null);
    }
  };

  const handleDirectCheckout = async (preferredMethod?: string) => {
    if (cart.length === 0) return;

    setActionLoadingId('direct_checkout');
    setError(null);

    try {
      const cartProductIds = cart.map((item) => item.product.id);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: cartProductIds }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Checkout process failed.');
      }

      triggerRazorpayCheckout(data, null, preferredMethod);
    } catch (err: any) {
      setError(err.message);
      setActionLoadingId(null);
    }
  };

  const handleRespond = async (decisionId: string, response: 'approved' | 'rejected') => {
    if (!decisionId) return;

    setActionLoadingId(decisionId);
    setError(null);

    try {
      const res = await fetch(`/api/decisions/${decisionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process decision response');
      }

      if (response === 'approved') {
        triggerRazorpayCheckout(data, decisionId);
      } else {
        // Remove rejected item card from active view
        setRecList((prev) => prev.filter((item) => item.decision_id !== decisionId));
        setActionLoadingId(null);
      }
    } catch (err: any) {
      setError(err.message);
      setActionLoadingId(null);
    }
  };

  const handleAgentUtterance = async (transcript: string) => {
    if (!transcript || !transcript.trim()) return;

    try {
      setIsAgentExecuting(true);
      setVoiceFeedback(null);
      setAgentReasoningSteps([]);
      setShowTrace(false);

      const cartProductIds = cart.map((item) => item.product.id);

      const res = await fetch('/api/voice-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          cart: cartProductIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute agent intent tools');
      }

      // Store reasoning steps for live UI visibility
      if (Array.isArray(data.reasoning_steps)) {
        setAgentReasoningSteps(data.reasoning_steps);
      }

      setVoiceFeedback(data.feedback_text);

      // Act on tool execution results
      if (data.intent_type === 'add_to_cart' && data.matched_product) {
        addToCart(data.matched_product);
      } else if (data.intent_type === 'remove_from_cart' && data.matched_product) {
        removeFromCart(data.matched_product.id);
      } else if (data.intent_type === 'clear_cart') {
        clearCart();
      } else if (data.intent_type === 'checkout') {
        handleDirectCheckout(data.payment_method_preference);
      }

      setTextQueryInput('');
    } catch (err: any) {
      setError(`Agent processing error: ${err.message}`);
    } finally {
      setIsAgentExecuting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Cart Checkout</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-black text-blue-700 uppercase tracking-wide border border-blue-200">
              ⚡ LLM Agentic Tooling
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Review cart, execute open-ended voice/text agent commands in English or Hindi, &amp; trigger Razorpay checkout.
          </p>
        </div>

        {/* Voice Input Component with Hindi support */}
        <div className="md:self-end">
          <VoiceInput onTranscriptComplete={handleAgentUtterance} disabled={recLoading || !!actionLoadingId || isAgentExecuting} />
        </div>
      </div>

      {/* Open-ended Text Agent Command Box */}
      <div className="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 p-4 shadow-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAgentUtterance(textQueryInput);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-sm">
              🤖
            </span>
            <input
              type="text"
              placeholder="Ask agent: 'Recommend me skincare with niacinamide' or 'Netbanking se checkout karo'..."
              value={textQueryInput}
              onChange={(e) => setTextQueryInput(e.target.value)}
              disabled={isAgentExecuting || recLoading}
              className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 py-2.5 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!textQueryInput.trim() || isAgentExecuting}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700 shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isAgentExecuting ? 'Executing Tools...' : 'Ask AI Agent'}
          </button>
        </form>

        {/* Agent response + collapsible trace */}
        {(voiceFeedback || agentReasoningSteps.length > 0) && (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-3.5 shadow-xs space-y-2">
            {/* Final response — always visible */}
            {voiceFeedback && (
              <p className="text-xs font-semibold text-slate-800 flex items-start gap-2">
                <span className="mt-0.5 text-base">🗣️</span>
                <span>{voiceFeedback}</span>
              </p>
            )}

            {/* Trace toggle — only shown if steps exist */}
            {agentReasoningSteps.length > 0 && (
              <div>
                <button
                  onClick={() => setShowTrace((v) => !v)}
                  className="text-[10px] font-semibold text-slate-400 hover:text-indigo-600 transition underline-offset-2 hover:underline mt-1"
                >
                  {showTrace ? 'Hide details ▲' : `Show details (${agentReasoningSteps.length} step${agentReasoningSteps.length !== 1 ? 's' : ''}) ▼`}
                </button>

                {showTrace && (
                  <div className="mt-2 space-y-1.5 font-mono text-[11px]">
                    {agentReasoningSteps.map((step, idx) => {
                      const friendlyMap: Record<string, string> = {
                        search_catalog: '🔍 Searching catalog...',
                        search_results: step.detail.includes('Found 0')
                          ? "🤝 No matches found."
                          : `✅ ${step.detail}`,
                        search_no_match: step.detail,
                        add_to_cart: '🛒 Adding item to cart...',
                        remove_from_cart: '🗑️ Removing item from cart...',
                        get_recommendations: '🤖 Fetching AI recommendations...',
                        initiate_checkout: '💳 Initiating checkout...',
                        checkout_initiated: '💳 Checkout initiated.',
                        cart_updated: step.detail,
                        recommendations_retrieved: step.detail,
                      };
                      const display = friendlyMap[step.step] ?? `${step.step}: ${step.detail}`;
                      return (
                        <div key={idx} className="flex items-start gap-2 text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          <span className="font-bold text-blue-500">→</span>
                          <div>{display}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {/* Order Confirmation Banner */}
      {orderConfirmation && (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-md">
          <div className="flex items-center space-x-3 text-emerald-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 font-bold text-xl text-emerald-700">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Order Placed Successfully via Razorpay MCP!
              </h2>
              <p className="text-xs text-emerald-800 font-medium">
                Razorpay Order ID: <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900">{orderConfirmation.razorpay_order_id}</code>
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-emerald-200 pt-4">
            <div className="rounded-lg bg-white p-4 border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Order Amount</span>
              <p className="mt-1 text-xl font-extrabold text-slate-900">
                ₹{orderConfirmation.total_amount_inr}
              </p>
            </div>

            <div className="rounded-lg bg-white p-4 border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Status</span>
              <p className="mt-1 text-base font-bold text-emerald-600">
                {orderConfirmation.final_status}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Cart Items List */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Your Items ({cart.length})</h2>

          {cart.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 shadow-xs">
              Your cart is empty. Try typing or speaking: &quot;recommend me skincare with niacinamide&quot; or &quot;skincare dikhao&quot;.
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition"
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {item.product.category}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">
                      {item.product.name}
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      ₹{(item.product.price / 100).toLocaleString('en-IN')} × {item.quantity}
                    </p>
                  </div>

                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-extrabold text-slate-900">
                      ₹{((item.product.price * item.quantity) / 100).toLocaleString('en-IN')}
                    </span>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-xs font-semibold text-slate-400 hover:text-red-600 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Summary & Smart AI Recommendation Cards */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Order Summary</h3>

            {/* Shipping Address Inputs */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Shipping Details</h4>
              <div>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={shippingAddress.fullName || customer?.name || ''}
                  onChange={(e) => setShippingAddress(prev => ({ ...prev, fullName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Address Line"
                  value={shippingAddress.addressLine}
                  onChange={(e) => setShippingAddress(prev => ({ ...prev, addressLine: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="City"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Pincode"
                  value={shippingAddress.pincode}
                  onChange={(e) => setShippingAddress(prev => ({ ...prev, pincode: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500 font-medium">Subtotal</span>
              <span className="text-base font-black text-slate-900">
                ₹{(cartTotalPaise / 100).toLocaleString('en-IN')}
              </span>
            </div>

            <button
              onClick={() => handleDirectCheckout()}
              disabled={cart.length === 0 || !!actionLoadingId}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {actionLoadingId === 'direct_checkout' ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Opening Razorpay Checkout...</span>
                </>
              ) : (
                <span>Proceed to Checkout &amp; Pay via Razorpay</span>
              )}
            </button>
          </div>

          <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

          {/* AI Recommendation Header */}
          {cart.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                  <span>✨ Smart AI Recommendations</span>
                  {recLoading && (
                    <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                  )}
                </h3>
                <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {recList.filter((r) => r.candidate).length} suggestions
                </span>
              </div>

              {recLoading && recList.length === 0 && (
                <div className="rounded-xl border border-blue-100 bg-white p-6 text-center text-xs text-slate-500 shadow-xs animate-pulse">
                  Analyzing cart signals &amp; user history...
                </div>
              )}

              {/* Stacked Recommendation Cards */}
              {recList.map((rec, index) => {
                if (!rec.candidate) {
                  return (
                    <div
                      key={`empty-rec-${index}`}
                      className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-xs"
                    >
                      {rec.reasoning}
                    </div>
                  );
                }

                const isLoadingThis = actionLoadingId === rec.decision_id;

                return (
                  <div
                    key={rec.decision_id || `rec-${rec.candidate.id}`}
                    className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm space-y-3 transition hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-100">
                        Suggestion #{index + 1}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {rec.candidate.name}
                      </h4>
                      <p className="mt-0.5 text-xs text-blue-600 font-extrabold">
                        Upsell Price: ₹{(rec.candidate.price / 100).toLocaleString('en-IN')}
                      </p>

                      <div className="mt-2.5 rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <p className="text-xs text-slate-700 italic">
                          &quot;{rec.reasoning}&quot;
                        </p>
                      </div>

                      <div className="mt-4 flex gap-2.5">
                        <button
                          onClick={() => handleRespond(rec.decision_id, 'approved')}
                          disabled={!!actionLoadingId}
                          className="flex-1 rounded-lg bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow-xs disabled:opacity-50 transition"
                        >
                          {isLoadingThis ? 'Processing...' : 'Approve & Pay via Razorpay'}
                        </button>

                        <button
                          onClick={() => handleRespond(rec.decision_id, 'rejected')}
                          disabled={!!actionLoadingId}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs disabled:opacity-50 transition"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
