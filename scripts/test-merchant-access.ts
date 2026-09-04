import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

async function testMerchantAccessControl() {
  console.log('=== TESTING MERCHANT AUDIT ACCESS CONTROL ===\n');

  // 1. Create Non-Merchant User
  const emailNonMerchant = `user_non_merchant_${Date.now()}@cartmind.app`;
  const password = 'Password123!';

  console.log(`Creating non-merchant user: ${emailNonMerchant}`);
  const { data: authUser, error: errUser } = await adminSupabase.auth.admin.createUser({
    email: emailNonMerchant,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Regular Customer' }
  });

  if (errUser || !authUser.user) {
    console.error('Failed to create non-merchant user:', errUser);
    return;
  }

  // Insert linked customer record with is_merchant = false
  await adminSupabase.from('customers').insert({
    user_id: authUser.user.id,
    name: 'Regular Customer',
    is_merchant: false
  });

  // Sign in as non-merchant client to get access cookie/JWT
  const clientUser = createClient(supabaseUrl, anonKey);
  const { data: sessionUser } = await clientUser.auth.signInWithPassword({
    email: emailNonMerchant,
    password
  });

  const accessTokenUser = sessionUser.session?.access_token;

  console.log('\n--- 1. Testing GET /api/audit as Non-Merchant User ---');
  const res1 = await fetch('http://localhost:3000/api/audit', {
    headers: {
      Authorization: `Bearer ${accessTokenUser}`
    }
  });

  console.log(`HTTP Status: ${res1.status} (Expected: 403 Forbidden)`);
  const data1 = await res1.json();
  console.log('Response:', data1);

  if (res1.status === 403) {
    console.log('✅ SUCCESS: /api/audit correctly blocked non-merchant account!');
  } else {
    console.error('❌ FAILURE: Access was not blocked for non-merchant account!');
  }

  // 2. Create Merchant User
  const emailMerchant = `user_merchant_${Date.now()}@cartmind.app`;
  console.log(`\nCreating merchant user: ${emailMerchant}`);

  const { data: authMerchant, error: errMerchant } = await adminSupabase.auth.admin.createUser({
    email: emailMerchant,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Merchant Admin', is_merchant: true }
  });

  if (errMerchant || !authMerchant.user) {
    console.error('Failed to create merchant user:', errMerchant);
    return;
  }

  // Insert linked customer record with is_merchant = true
  await adminSupabase.from('customers').insert({
    user_id: authMerchant.user.id,
    name: 'Merchant Admin',
    is_merchant: true
  });

  const clientMerchant = createClient(supabaseUrl, anonKey);
  const { data: sessionMerchant } = await clientMerchant.auth.signInWithPassword({
    email: emailMerchant,
    password
  });

  const accessTokenMerchant = sessionMerchant.session?.access_token;

  console.log('\n--- 2. Testing GET /api/audit as Merchant User ---');
  const res2 = await fetch('http://localhost:3000/api/audit', {
    headers: {
      Authorization: `Bearer ${accessTokenMerchant}`
    }
  });

  console.log(`HTTP Status: ${res2.status} (Expected: 200 OK)`);
  const data2 = await res2.json();
  console.log(`Received ${Array.isArray(data2) ? data2.length : 0} decision logs.`);

  if (res2.status === 200 && Array.isArray(data2)) {
    console.log('✅ SUCCESS: /api/audit granted access to merchant account!');
  } else {
    console.error('❌ FAILURE: Access was denied for merchant account!');
  }
}

testMerchantAccessControl();
