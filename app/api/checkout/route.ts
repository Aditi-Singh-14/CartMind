import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { createOrderViaMcp } from '@/lib/mcp/razorpay';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedCustomer(req);
    if ('response' in auth) return auth.response;
    const { customer } = auth;

    const body = await req.json();
    const { cart } = body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: cart (non-empty array of product IDs)' },
        { status: 400 }
      );
    }

    const cartProductIds = cart.filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
    if (cartProductIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid cart: must contain product ID strings' },
        { status: 400 }
      );
    }

    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', cartProductIds);

    if (prodErr || !products || products.length === 0) {
      return NextResponse.json(
        { error: 'Failed to retrieve cart products for checkout.' },
        { status: 400 }
      );
    }

    const prodMap = new Map(products.map((p) => [p.id, p]));
    let totalAmountPaise = 0;
    for (const pid of cartProductIds) {
      const p = prodMap.get(pid);
      if (p) totalAmountPaise += Number(p.price);
    }

    if (totalAmountPaise <= 0) {
      return NextResponse.json(
        { error: 'Cart total must be greater than zero.' },
        { status: 400 }
      );
    }

    const receiptId = `rcpt_cart_${Date.now()}_${customer.id.replace(/-/g, '').slice(0, 12)}`;

    const { mcp_call, mcp_result, razorpay_order_id, mcp_endpoint } =
      await createOrderViaMcp({
        amount: totalAmountPaise,
        currency: 'INR',
        receipt: receiptId,
        notes: {
          checkout_type: 'cart_only',
          customer_id: customer.id,
        },
      });

    const { data: newOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        customer_id: customer.id,
        razorpay_order_id,
        total_amount: totalAmountPaise,
        status: 'created',
      })
      .select()
      .single();

    if (orderErr || !newOrder) {
      console.error('Error creating cart-only order in Supabase:', orderErr);
      return NextResponse.json(
        { error: 'Failed to create order record after Razorpay MCP call.' },
        { status: 500 }
      );
    }

    const orderItemsToInsert = cartProductIds
      .map((pid) => {
        const p = prodMap.get(pid);
        if (!p) return null;
        return {
          order_id: newOrder.id,
          product_id: p.id,
          quantity: 1,
          unit_price: p.price,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const { error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsToInsert);

    if (itemsErr) {
      console.error('Error inserting cart-only order items:', itemsErr);
    }

    return NextResponse.json({
      checkout_type: 'cart_only',
      order_id: newOrder.id,
      customer_id: customer.id,
      razorpay_order_id,
      total_amount: totalAmountPaise,
      total_amount_inr: (totalAmountPaise / 100).toFixed(2),
      mcp_endpoint,
      mcp_call,
      mcp_result,
    });
  } catch (err: any) {
    console.error('API /api/checkout Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
