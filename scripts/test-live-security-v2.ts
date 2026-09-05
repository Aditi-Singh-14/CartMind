import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testSecurityWithAuthenticatedSession() {
  console.log('--- LIVE TEST 2: SECURITY - SPOOFED customer_id WITH AUTHENTICATED SESSION ---');

  // 1. Get existing customers to use for testing
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, user_id')
    .limit(3);

  if (!customers || customers.length < 2) {
    console.error('Need at least 2 customers for this test. Run seed-data.ts first.');
    return;
  }

  const customer1 = customers[0];
  const customer2 = customers[1];

  console.log(`Customer 1 (session): ${customer1.name} (ID: ${customer1.id}, user_id: ${customer1.user_id})`);
  console.log(`Customer 2 (spoofed): ${customer2.name} (ID: ${customer2.id}, user_id: ${customer2.user_id})`);

  // 2. If customer1 has no user_id, create one and link it
  let userId = customer1.user_id;
  let testEmail, testPassword;

  if (!userId) {
    testEmail = `security-test-${Date.now()}@example.com`;
    testPassword = 'TestPassword123!';
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });

    if (authError) {
      console.error('Error creating test user:', authError);
      return;
    }

    userId = authData.user?.id;
    console.log(`✓ Test auth user created: ${userId}`);

    // Link customer1 to this auth user
    const { error: updateError } = await supabase
      .from('customers')
      .update({ user_id: userId })
      .eq('id', customer1.id);

    if (updateError) {
      console.error('Error linking customer to user:', updateError);
      return;
    }

    console.log(`✓ Customer 1 linked to auth user`);
  } else {
    // Customer already has a user, we need to sign in as that user
    // For this test, we'll create a new auth user and link it
    testEmail = `security-test-${Date.now()}@example.com`;
    testPassword = 'TestPassword123!';
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });

    if (authError) {
      console.error('Error creating test user:', authError);
      return;
    }

    userId = authData.user?.id;
    console.log(`✓ Test auth user created: ${userId}`);

    // Update customer1 to use this new auth user
    const { error: updateError } = await supabase
      .from('customers')
      .update({ user_id: userId })
      .eq('id', customer1.id);

    if (updateError) {
      console.error('Error linking customer to user:', updateError);
      return;
    }

    console.log(`✓ Customer 1 linked to new auth user`);
  }

  // 3. Sign in to get auth token
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (signInError) {
    console.error('Error signing in:', signInError);
    return;
  }

  const accessToken = signInData.session?.access_token;
  console.log('✓ Signed in successfully');
  console.log(`Access Token: ${accessToken?.substring(0, 20)}...`);

  // 4. Test /api/recommend with spoofed customer_id
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

  // 5. Test /api/decisions/[id]/respond with spoofed customer_id
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
}

testSecurityWithAuthenticatedSession();
