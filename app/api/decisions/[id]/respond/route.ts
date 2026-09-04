import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { createOrderViaMcp } from '@/lib/mcp/razorpay';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decisionId = params.id;
    const body = await req.json();
    const { response } = body;

    if (!response || !['approved', 'rejected'].includes(response)) {
      return NextResponse.json(
        { error: "Invalid request body. 'response' must be 'approved' or 'rejected'." },
        { status: 400 }
      );
    }

    // 1. Retrieve agent decision record
    const { data: decision, error: fetchErr } = await supabaseAdmin
      .from('agent_decisions')
      .select('*')
      .eq('id', decisionId)
      .single();

    if (fetchErr || !decision) {
      return NextResponse.json(
        { error: `Agent decision with ID '${decisionId}' not found.` },
        { status: 404 }
      );
    }

    // 2. INDEPENDENT GATE RE-VALIDATION
    // If bound_check_passed is false, reject any 'approved' response outright (403)
    if (response === 'approved' && !decision.bound_check_passed) {
      return NextResponse.json(
        {
          error: 'Approval Gate Violation: Cannot approve a recommendation that failed bound checks.',
          decision_id: decisionId,
          bound_check_passed: decision.bound_check_passed,
          bound_check_rule: decision.bound_check_rule
        },
        { status: 403 }
      );
    }

    // 3. REJECTION FLOW
    if (response === 'rejected') {
      const { data: updatedDecision, error: updateErr } = await supabaseAdmin
        .from('agent_decisions')
        .update({
          user_response: 'rejected',
          final_status: 'rejected_by_user',
          mcp_call: null,
          mcp_result: null,
          revenue_delta: null
        })
        .eq('id', decisionId)
        .select()
        .single();

      if (updateErr) {
        console.error('Error updating decision to rejected:', updateErr);
      }

      return NextResponse.json({
        decision_id: decisionId,
        user_response: 'rejected',
        final_status: 'rejected_by_user',
        message: 'Recommendation rejected by user. No order created.'
      });
    }

    // 4. APPROVAL FLOW & GENUINE RAZORPAY MCP SDK CHECKOUT
    // Fetch prices of all input cart items + candidate item
    const cartProductIds: string[] = Array.isArray(decision.input_cart) ? decision.input_cart : [];
    const allProductIds = [...cartProductIds];
    if (decision.candidate_item_id) {
      allProductIds.push(decision.candidate_item_id);
    }

    const { data: products, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', allProductIds);

    if (prodErr || !products) {
      return NextResponse.json(
        { error: 'Failed to retrieve products for checkout.' },
        { status: 500 }
      );
    }

    const prodMap = new Map(products.map(p => [p.id, p]));
    const candidateProduct = decision.candidate_item_id ? prodMap.get(decision.candidate_item_id) : null;

    if (!candidateProduct) {
      return NextResponse.json(
        { error: 'Candidate product for decision not found.' },
        { status: 400 }
      );
    }

    // Calculate total order amount in paise
    let totalAmountPaise = 0;
    for (const pid of cartProductIds) {
      const p = prodMap.get(pid);
      if (p) totalAmountPaise += Number(p.price);
    }
    totalAmountPaise += Number(candidateProduct.price);

    const revenueDelta = Number(candidateProduct.price); // Upsell amount in paise
    const receiptId = `rcpt_${decisionId.replace(/-/g, '').substring(0, 30)}`;

    // Execute Order Creation via Genuine MCP SDK Client -> https://mcp.razorpay.com/mcp
    const { mcp_call, mcp_result, razorpay_order_id, mcp_endpoint } = await createOrderViaMcp({
      amount: totalAmountPaise,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        decision_id: decisionId,
        customer_id: decision.customer_id,
        candidate_item: candidateProduct.name,
        upsell_amount_paise: String(revenueDelta)
      }
    });

    // 5. UPDATE AGENT DECISION WITH RAW MCP PROTOCOL CALL & RESULT
    const { data: updatedDecision, error: updateErr } = await supabaseAdmin
      .from('agent_decisions')
      .update({
        user_response: 'approved',
        final_status: 'order_created',
        mcp_call: mcp_call,
        mcp_result: mcp_result,
        revenue_delta: revenueDelta
      })
      .eq('id', decisionId)
      .select()
      .single();

    if (updateErr) {
      console.error('Error updating decision record with MCP results:', updateErr);
    }

    // 6. CREATE ORDER & ORDER ITEMS IN SUPABASE
    const { data: newOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        customer_id: decision.customer_id,
        razorpay_order_id: razorpay_order_id,
        total_amount: totalAmountPaise,
        status: 'created'
      })
      .select()
      .single();

    if (orderErr || !newOrder) {
      console.error('Error creating order in Supabase:', orderErr);
    } else {
      const orderItemsToInsert = [];
      
      for (const pid of cartProductIds) {
        const p = prodMap.get(pid);
        if (p) {
          orderItemsToInsert.push({
            order_id: newOrder.id,
            product_id: p.id,
            quantity: 1,
            unit_price: p.price
          });
        }
      }

      orderItemsToInsert.push({
        order_id: newOrder.id,
        product_id: candidateProduct.id,
        quantity: 1,
        unit_price: candidateProduct.price
      });

      const { error: itemsErr } = await supabaseAdmin
        .from('order_items')
        .insert(orderItemsToInsert);

      if (itemsErr) {
        console.error('Error inserting order items in Supabase:', itemsErr);
      }
    }

    // 7. RETURN CHECKOUT RESPONSE WITH MCP PROTOCOL METADATA
    return NextResponse.json({
      decision_id: decisionId,
      user_response: 'approved',
      final_status: 'order_created',
      mcp_endpoint: mcp_endpoint,
      razorpay_order_id: razorpay_order_id,
      total_amount: totalAmountPaise,
      total_amount_inr: (totalAmountPaise / 100).toFixed(2),
      revenue_delta: revenueDelta,
      revenue_delta_inr: (revenueDelta / 100).toFixed(2),
      mcp_call: mcp_call,
      mcp_result: mcp_result
    });
  } catch (err: any) {
    console.error('POST /api/decisions/[id]/respond Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
