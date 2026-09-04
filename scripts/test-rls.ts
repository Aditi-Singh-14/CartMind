import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function testRlsIsolation() {
  console.log('=== TESTING SUPABASE AUTH & RLS DATA ISOLATION ===\n');

  // 1. Create User A via Admin API
  const emailA = `testuser_a_${Date.now()}@cartmind.app`;
  const passwordA = 'Password123!';

  console.log(`1. Creating User A: ${emailA}`);
  const { data: authA, error: errA } = await adminSupabase.auth.admin.createUser({
    email: emailA,
    password: passwordA,
    email_confirm: true,
    user_metadata: { full_name: 'Test User A' }
  });

  if (errA || !authA.user) {
    console.error('Create User A failed:', errA);
    return;
  }
  console.log(`User A created! Auth UID: ${authA.user.id}`);

  // Create linked customer row
  const { data: custA } = await adminSupabase
    .from('customers')
    .insert({ user_id: authA.user.id, name: 'Test User A' })
    .select()
    .single();

  console.log('User A Customer Row:', custA);

  // 2. Create User B via Admin API
  const emailB = `testuser_b_${Date.now()}@cartmind.app`;
  const passwordB = 'Password123!';

  console.log(`\n2. Creating User B: ${emailB}`);
  const { data: authB, error: errB } = await adminSupabase.auth.admin.createUser({
    email: emailB,
    password: passwordB,
    email_confirm: true,
    user_metadata: { full_name: 'Test User B' }
  });

  if (errB || !authB.user) {
    console.error('Create User B failed:', errB);
    return;
  }
  console.log(`User B created! Auth UID: ${authB.user.id}`);

  // Create linked customer row
  const { data: custB } = await adminSupabase
    .from('customers')
    .insert({ user_id: authB.user.id, name: 'Test User B' })
    .select()
    .single();

  console.log('User B Customer Row:', custB);

  // Sign in clientA and clientB using anon client to obtain session JWTs
  const clientA = createClient(supabaseUrl, anonKey);
  const clientB = createClient(supabaseUrl, anonKey);

  await clientA.auth.signInWithPassword({ email: emailA, password: passwordA });
  await clientB.auth.signInWithPassword({ email: emailB, password: passwordB });

  // 3. User A creates an Order via clientA (obeying RLS)
  console.log('\n3. User A creating an order via authenticated clientA...');
  const { data: orderA, error: orderErrA } = await clientA
    .from('orders')
    .insert({
      customer_id: custA.id,
      total_amount: 50000,
      status: 'completed',
      razorpay_order_id: 'order_test_rls_user_a'
    })
    .select()
    .single();

  if (orderErrA) {
    console.error('User A order creation error:', orderErrA);
    return;
  }
  console.log('User A Created Order:', orderA);

  // 4. TEST RLS ISOLATION: User B attempts to query User A's order
  console.log("\n4. TEST RLS ISOLATION: User B attempting to query User A's order...");
  const { data: userBQueryForOrderA } = await clientB
    .from('orders')
    .select('*')
    .eq('id', orderA.id);

  console.log("User B Query Result for User A's Order (Should be empty [] due to RLS):", userBQueryForOrderA);

  if (Array.isArray(userBQueryForOrderA) && userBQueryForOrderA.length === 0) {
    console.log('\n✅ SUCCESS: RLS Policy successfully blocked User B from reading User A\'s orders!');
  } else {
    console.error('\n❌ FAILURE: RLS did not isolate data! Returned:', userBQueryForOrderA);
  }

  // 5. TEST RLS ISOLATION ON CUSTOMERS: User B attempts to read User A's customer record
  console.log("\n5. TEST RLS ISOLATION: User B attempting to query User A's customer record...");
  const { data: userBQueryForCustA } = await clientB
    .from('customers')
    .select('*')
    .eq('id', custA.id);

  console.log("User B Query Result for User A's Customer Record (Should be empty [] due to RLS):", userBQueryForCustA);

  if (Array.isArray(userBQueryForCustA) && userBQueryForCustA.length === 0) {
    console.log('✅ SUCCESS: RLS Policy successfully blocked User B from reading User A\'s customer record!');
  } else {
    console.error('❌ FAILURE: RLS did not isolate customer record! Returned:', userBQueryForCustA);
  }
}

testRlsIsolation();
