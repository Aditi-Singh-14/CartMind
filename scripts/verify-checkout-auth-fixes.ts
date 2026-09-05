/**
 * Verify cart-only checkout and customer_id spoof rejection.
 * Requires: dev server on localhost:3000, .env.local with Supabase + Razorpay keys.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const baseUrl = process.env.CARTMIND_BASE_URL || 'http://localhost:3000';

const admin = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('=== VERIFY CHECKOUT DECOUPLE + CUSTOMER_ID AUTH ===\n');

  const email = `checkout_verify_${Date.now()}@cartmind.app`;
  const password = 'Password123!';

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Checkout Verify User' },
  });
  if (createErr || !authUser.user) {
    console.error('Failed to create test user:', createErr);
    process.exit(1);
  }

  const { data: customerRow, error: custErr } = await admin
    .from('customers')
    .insert({ user_id: authUser.user.id, name: 'Checkout Verify User' })
    .select('id')
    .single();
  if (custErr || !customerRow) {
    console.error('Failed to create customer row:', custErr);
    process.exit(1);
  }

  const client = createClient(supabaseUrl, anonKey);
  const { data: session } = await client.auth.signInWithPassword({ email, password });
  const token = session.session?.access_token;
  if (!token) {
    console.error('Failed to sign in test user');
    process.exit(1);
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const { data: products } = await admin.from('products').select('id, name, price');
  const cuttingBoard = products?.find((p) => p.name.includes('Bamboo Cutting Board'));
  if (!cuttingBoard) {
    console.error('Seed product not found');
    process.exit(1);
  }

  const { data: seedPriya } = await admin
    .from('customers')
    .select('id')
    .eq('name', 'Priya Patel')
    .is('user_id', null)
    .single();

  // TEST 1: Cart-only checkout (small cart, zero passing recommendations)
  console.log('--- TEST 1: Cart-only checkout (small cart) ---');
  const checkoutRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ cart: [cuttingBoard.id] }),
  });
  const checkoutData = await checkoutRes.json();
  console.log('Status:', checkoutRes.status, checkoutRes.status === 200 ? 'PASS' : 'FAIL');
  console.log('Response:', JSON.stringify(checkoutData, null, 2));
  const checkoutOk =
    checkoutRes.status === 200 &&
    checkoutData.checkout_type === 'cart_only' &&
    !!checkoutData.razorpay_order_id;
  console.log(checkoutOk ? '✓ Cart-only checkout succeeded\n' : '✗ Cart-only checkout failed\n');

  // TEST 2: Spoofed customer_id on /api/recommend → 403
  console.log('--- TEST 2: Spoofed customer_id on /api/recommend ---');
  const spoofRes = await fetch(`${baseUrl}/api/recommend`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      customer_id: seedPriya?.id || '00000000-0000-0000-0000-000000000001',
      cart: [cuttingBoard.id],
    }),
  });
  const spoofData = await spoofRes.json();
  console.log('Status:', spoofRes.status, spoofRes.status === 403 ? 'PASS' : 'FAIL');
  console.log('Response:', JSON.stringify(spoofData, null, 2));
  const spoofOk = spoofRes.status === 403;
  console.log(spoofOk ? '✓ Spoofed customer_id rejected\n' : '✗ Spoof not rejected\n');

  // TEST 3: Legitimate recommend (no body customer_id)
  console.log('--- TEST 3: Authenticated recommend (session customer) ---');
  const recRes = await fetch(`${baseUrl}/api/recommend`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ cart: [cuttingBoard.id] }),
  });
  const recData = await recRes.json();
  console.log('Status:', recRes.status, recRes.status === 200 ? 'PASS' : 'FAIL');
  console.log(
    'Recommendations returned:',
    Array.isArray(recData.recommendations) ? recData.recommendations.length : 'N/A'
  );
  const recOk = recRes.status === 200;
  console.log(recOk ? '✓ Session-based recommend works\n' : '✗ Recommend failed\n');

  // TEST 4: Unauthenticated recommend → 401
  console.log('--- TEST 4: Unauthenticated /api/recommend ---');
  const unauthRes = await fetch(`${baseUrl}/api/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart: [cuttingBoard.id] }),
  });
  console.log('Status:', unauthRes.status, unauthRes.status === 401 ? 'PASS' : 'FAIL');
  const unauthOk = unauthRes.status === 401;
  console.log(unauthOk ? '✓ Unauthenticated request rejected\n' : '✗ Should return 401\n');

  const allPass = checkoutOk && spoofOk && recOk && unauthOk;
  console.log('=== OVERALL:', allPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED', '===');
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
