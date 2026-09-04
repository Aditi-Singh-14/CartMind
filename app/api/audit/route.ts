import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, supabaseAdmin } from '@/lib/supabase/server';

export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    let { data: { user } } = await supabase.auth.getUser();

    // Fallback: check Authorization Bearer token header
    if (!user) {
      const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: authData } = await supabaseAdmin.auth.getUser(token);
        if (authData?.user) {
          user = authData.user;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
    }

    // Check if user is marked as merchant in metadata or in linked customers row
    const isMerchantMetadata = user.user_metadata?.is_merchant === true;

    const { data: customerRows } = await supabaseAdmin
      .from('customers')
      .select('is_merchant')
      .eq('user_id', user.id);

    const isMerchantCustomer = customerRows?.some((c) => (c as any).is_merchant === true);

    const isMerchant = isMerchantMetadata || isMerchantCustomer;

    if (!isMerchant) {
      return NextResponse.json(
        { error: 'Forbidden: Merchant audit access restricted to merchant accounts only' },
        { status: 403 }
      );
    }
    const { data: decisions, error } = await supabaseAdmin
      .from('agent_decisions')
      .select(`
        id,
        timestamp,
        customer_id,
        input_cart,
        candidate_item_id,
        signal_type,
        reasoning_text,
        bound_check_passed,
        bound_check_rule,
        user_response,
        final_status,
        revenue_delta,
        mcp_call,
        mcp_result,
        customers (
          name
        ),
        products:candidate_item_id (
          name,
          category,
          price
        )
      `)
      .order('timestamp', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(decisions || [], { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
