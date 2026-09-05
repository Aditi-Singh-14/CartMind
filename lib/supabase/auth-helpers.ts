import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServerClient, supabaseAdmin } from '@/lib/supabase/server';

export type AuthenticatedCustomer = {
  id: string;
  name: string;
  user_id: string;
};

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<User | null> {
  const supabase = createServerClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const authHeader =
      req.headers.get('Authorization') || req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: authData } = await supabaseAdmin.auth.getUser(token);
      user = authData?.user ?? null;
    }
  }

  return user;
}

export async function getAuthenticatedCustomer(
  req: NextRequest
): Promise<AuthenticatedCustomer | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) return null;

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, user_id')
    .eq('user_id', user.id)
    .single();

  if (error || !customer) return null;
  return customer as AuthenticatedCustomer;
}

export async function requireAuthenticatedCustomer(req: NextRequest): Promise<
  | { customer: AuthenticatedCustomer; user: User }
  | { response: NextResponse }
> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: 'Unauthorized: Authentication required' },
        { status: 401 }
      ),
    };
  }

  const customer = await getAuthenticatedCustomer(req);
  if (!customer) {
    return {
      response: NextResponse.json(
        { error: 'Customer account not found for authenticated user' },
        { status: 404 }
      ),
    };
  }

  return { customer, user };
}

/**
 * Reject requests that supply a customer_id differing from the session customer.
 */
export function rejectSpoofedCustomerId(
  bodyCustomerId: unknown,
  sessionCustomerId: string
): NextResponse | null {
  if (
    bodyCustomerId !== undefined &&
    bodyCustomerId !== null &&
    bodyCustomerId !== sessionCustomerId
  ) {
    return NextResponse.json(
      {
        error:
          'Forbidden: customer_id in request body does not match authenticated user',
      },
      { status: 403 }
    );
  }
  return null;
}
