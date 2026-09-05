import { NextRequest, NextResponse } from 'next/server';
import {
  rejectSpoofedCustomerId,
  requireAuthenticatedCustomer,
} from '@/lib/supabase/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getRecommendations } from '@/lib/recommendation/engine';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedCustomer(req);
    if ('response' in auth) return auth.response;
    const { customer } = auth;

    const body = await req.json();
    const { customer_id: bodyCustomerId, cart } = body;

    const spoofRejection = rejectSpoofedCustomerId(
      bodyCustomerId,
      customer.id
    );
    if (spoofRejection) return spoofRejection;

    if (!Array.isArray(cart)) {
      return NextResponse.json(
        { error: 'Missing required field: cart (array of product IDs)' },
        { status: 400 }
      );
    }

    const customer_id = customer.id;

    const recResults = await getRecommendations(customer_id, cart, 4);

    const loggedRecommendations = [];

    for (const recResult of recResults) {
      const { data: decisionRecord, error: logError } = await supabaseAdmin
        .from('agent_decisions')
        .insert({
          customer_id,
          input_cart: cart,
          candidate_item_id: recResult.candidate ? recResult.candidate.id : null,
          signal_type: recResult.signal_type,
          reasoning_text: recResult.reasoning,
          bound_check_passed: recResult.bound_check_passed,
          bound_check_rule: recResult.bound_check_rule,
          user_response: 'pending',
          final_status: recResult.bound_check_passed
            ? 'recommended'
            : 'rejected_by_bounds',
        })
        .select()
        .single();

      if (logError) {
        console.error('Error logging decision to agent_decisions:', logError);
      }

      loggedRecommendations.push({
        candidate: recResult.candidate,
        signal_type: recResult.signal_type,
        reasoning: recResult.reasoning,
        bound_check_passed: recResult.bound_check_passed,
        bound_check_rule: recResult.bound_check_rule,
        decision_id: decisionRecord ? decisionRecord.id : null,
      });
    }

    const customerRecommendations = loggedRecommendations.filter(
      (r) => r.bound_check_passed && r.candidate
    );

    const primary = customerRecommendations[0] || null;

    return NextResponse.json({
      recommendations: customerRecommendations,
      candidate: primary ? primary.candidate : null,
      signal_type: primary ? primary.signal_type : null,
      reasoning: primary ? primary.reasoning : '',
      bound_check_passed: primary ? primary.bound_check_passed : false,
      bound_check_rule: primary ? primary.bound_check_rule : '',
      decision_id: primary ? primary.decision_id : null,
    });
  } catch (err: any) {
    console.error('API /api/recommend Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
