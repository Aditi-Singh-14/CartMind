import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, supabaseAdmin } from '@/lib/supabase/server';

export const revalidate = 0;

/**
 * GET /api/audit/orders-total
 * Merchant-only: returns the sum of total_amount across all orders with
 * status 'created' or 'paid' (i.e. all orders that were initiated via checkout).
 */
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isMerchant = user.user_metadata?.is_merchant === true;
    if (!isMerchant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Sum total_amount for all orders that were initiated (created) or paid
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('total_amount, status')
      .in('status', ['created', 'paid']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalPaise = (orders || []).reduce(
      (sum, o) => sum + Number(o.total_amount || 0),
      0
    );

    return NextResponse.json({
      total_amount_paise: totalPaise,
      order_count: (orders || []).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
