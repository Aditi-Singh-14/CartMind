import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testSecurityWithAuthenticatedSession() {
  console.log('--- LIVE TEST 2: SECURITY - SPOOFED customer_id WITH AUTHENTICATED SESSION ---');

  // 1. Create two new customers with auth users
  const testEmail1 = `security-test-1-${Date.now()}@example.com`;
  const testPassword1 = 'TestPassword123!';
  const testEmail2 = `security-test-2-${Date.now()}@example.com`;
  const testPassword2 = 'TestPassword123!';
  
  // Create first auth user and customer
  const { data: authData1, error: authError1 } = await supabase.auth.signUp({
    email: testEmail1,
    password: testPassword1
  });

  if (authError1) {
    console.error('Error creating test user 1:', authError1);
    return;
  }

  const userId1 = authData1.user?.id;
  console.log(`✓ Test auth user 1 created: ${userId1}`);

  const { data: customer1, error: custError1 } = await supabase
    .from('customers')
    .insert({ name: 'Security Test User 1', user_id: userId1 })
    .select()
    .single();

  if (custError1) {
    console.error('Error creating customer 1:', custError1);
    return;
  }

  console.log(`✓ Customer 1 created: ${customer1.id}`);

  // Create second auth user and customer
  const { data: authData2, error: authError2 } = await supabase.auth.signUp({
    email: testEmail2,
    password: testPassword2
  });

  if (authError2) {
    console.error('Error creating test user 2:', authError2);
    return;
  }

  const userId2 = authData2.user?.id;
  console.log(`✓ Test auth user 2 created: ${userId2}`);

  const { data: customer2, error: custError2 } = await supabase
    .from('customers')
    .insert({ name: 'Security Test User 2', user_id: userId2 })
    .select()
    .single();

  if (custError2) {
    console.error('Error creating customer 2:', custError2);
    return;
  }

  console.log(`✓ Customer 2 created: ${customer2.id}`);

  console.log(`\nCustomer 1 (session): ${customer1.name} (ID: ${customer1.id}, user_id: ${customer1.user_id})`);
  console.log(`Customer 2 (spoofed): ${customer2.name} (ID: ${customer2.id}, user_id: ${customer2.user_id})`);

  // 2. Sign in as user 1 to get auth token
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail1,
    password: testPassword1
  });

  if (signInError) {
    console.error('Error signing in:', signInError);
    return;
  }

  const accessToken = signInData.session?.access_token;
  console.log('\n✓ Signed in as user 1 successfully');
  console.log(`Access Token: ${accessToken?.substring(0, 20)}...`);

  // 3. Test /api/recommend with spoofed customer_id
  console.log('\n--- Testing /api/recommend with spoofed customer_id ---');
  console.log(`Session customer_id: ${customer1.id}`);
  console.log(`Spoofed customer_id in body: ${customer2.id}`);

  try {
    const response = await fetch('http://localhost:3000/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        customer_id: customer2.id, // Spoofed ID
        cart: []
      })
    });

    const data = await response.json();
    console.log(`\nStatus: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    if (response.status === 403 && data.error?.includes('customer_id')) {
      console.log('\n✓ SECURITY FIX VERIFIED: Spoofed customer_id REJECTED (403)');
    } else if (response.status === 401) {
      console.log('\n✗ SECURITY ISSUE: Got 401 instead of 403 - auth check failing before customer_id check');
    } else if (response.status === 404) {
      console.log('\n✗ SECURITY ISSUE: Got 404 - customer lookup failing');
    } else {
      console.log('\n✗ SECURITY ISSUE: Spoofed customer_id was NOT rejected');
    }
  } catch (error) {
    console.error('Error testing /api/recommend:', error);
  }

  // 4. Test /api/decisions/[id]/respond with spoofed customer_id
  console.log('\n--- Testing /api/decisions/[id]/respond with spoofed customer_id ---');
  
  // Create a test decision for customer1
  const { data: newDecision } = await supabase
    .from('agent_decisions')
    .insert({
      customer_id: customer1.id,
      input_cart: [],
      candidate_item_id: null,
      reasoning_text: 'Test decision for security check',
      bound_check_passed: false,
      bound_check_rule: 'Test rule',
      user_response: 'pending',
      final_status: 'test'
    })
    .select()
    .single();

  if (newDecision) {
    console.log(`Created test decision: ${newDecision.id}`);
    console.log(`Session customer_id: ${customer1.id}`);
    console.log(`Spoofed customer_id in body: ${customer2.id}`);

    try {
      const response = await fetch(`http://localhost:3000/api/decisions/${newDecision.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          customer_id: customer2.id, // Spoofed ID
          response: 'rejected'
        })
      });

      const data = await response.json();
      console.log(`\nStatus: ${response.status}`);
      console.log(`Response:`, JSON.stringify(data, null, 2));

      if (response.status === 403 && data.error?.includes('customer_id')) {
        console.log('\n✓ SECURITY FIX VERIFIED: Spoofed customer_id REJECTED (403)');
      } else if (response.status === 401) {
        console.log('\n✗ SECURITY ISSUE: Got 401 instead of 403 - auth check failing before customer_id check');
      } else if (response.status === 404) {
        console.log('\n✗ SECURITY ISSUE: Got 404 - customer lookup failing');
      } else {
        console.log('\n✗ SECURITY ISSUE: Spoofed customer_id was NOT rejected');
      }
    } catch (error) {
      console.error('Error testing /api/decisions/[id]/respond:', error);
    }
  }

  console.log('\n--- TEST 2 COMPLETE ---');
  console.log(`Test user 1 email: ${testEmail1}`);
  console.log(`Test user 1 password: ${testPassword1}`);
  console.log(`Test user 2 email: ${testEmail2}`);
  console.log(`Test user 2 password: ${testPassword2}`);
}

testSecurityWithAuthenticatedSession();
