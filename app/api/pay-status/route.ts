import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { razorpay_order_id, decision_id, status, payment_id, shipping_address } = body;

    if (!razorpay_order_id || !status) {
      return NextResponse.json({ error: 'Missing required parameters: razorpay_order_id, status' }, { status: 400 });
    }

    // 1. Update orders table in Supabase
    const { data: updatedOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .update({
        status: status === 'payment_completed' ? 'paid' : 'payment_failed',
        shipping_address: shipping_address || null
      })
      .eq('razorpay_order_id', razorpay_order_id)
      .select()
      .single();

    if (orderErr) {
      console.error('Error updating order status in Supabase:', orderErr);
    }

    // 2. Update agent_decisions table final_status
    if (decision_id) {
      const { error: decisionErr } = await supabaseAdmin
        .from('agent_decisions')
        .update({
          final_status: status
        })
        .eq('id', decision_id);

      if (decisionErr) {
        console.error('Error updating decision final_status:', decisionErr);
      }
    }

    return NextResponse.json({
      success: true,
      status: status,
      order: updatedOrder
    });
  } catch (err: any) {
    console.error('API /api/pay-status Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
