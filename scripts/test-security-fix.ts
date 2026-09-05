import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testSecurityFix() {
  console.log('--- TESTING SECURITY FIX: customer_id SPOOFING ---');

  // 1. Get a real customer to test with
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .limit(1);

  if (!customers || customers.length === 0) {
    console.error('No customers found in database. Run seed-data.ts first.');
    return;
  }

  const realCustomer = customers[0];
  const fakeCustomerId = '00000000-0000-0000-0000-000000000001'; // Fake UUID

  console.log(`Real customer ID: ${realCustomer.id}`);
  console.log(`Fake customer ID: ${fakeCustomerId}`);

  // 2. Test /api/recommend with spoofed customer_id
  console.log('\n--- Testing /api/recommend with spoofed customer_id ---');
  try {
    const response = await fetch('http://localhost:3000/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: fakeCustomerId, // Spoofed ID
        cart: []
      })
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, data);

    if (response.status === 403 && data.error?.includes('customer_id')) {
      console.log('✓ SECURITY FIX VERIFIED: Spoofed customer_id rejected');
    } else {
      console.log('✗ SECURITY ISSUE: Spoofed customer_id was not rejected');
    }
  } catch (error) {
    console.error('Error testing /api/recommend:', error);
  }

  // 3. Test /api/decisions/[id]/respond with spoofed customer_id
  console.log('\n--- Testing /api/decisions/[id]/respond with spoofed customer_id ---');
  
  // First, get a real decision ID
  const { data: decisions } = await supabase
    .from('agent_decisions')
    .select('id')
    .limit(1);

  if (decisions && decisions.length > 0) {
    const decisionId = decisions[0].id;
    console.log(`Testing with decision ID: ${decisionId}`);

    try {
      const response = await fetch(`http://localhost:3000/api/decisions/${decisionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: fakeCustomerId, // Spoofed ID
          response: 'rejected'
        })
      });

      const data = await response.json();
      console.log(`Status: ${response.status}`);
      console.log(`Response:`, data);

      if (response.status === 403 && data.error?.includes('customer_id')) {
        console.log('✓ SECURITY FIX VERIFIED: Spoofed customer_id rejected');
      } else {
        console.log('✗ SECURITY ISSUE: Spoofed customer_id was not rejected');
      }
    } catch (error) {
      console.error('Error testing /api/decisions/[id]/respond:', error);
    }
  } else {
    console.log('No agent_decisions found to test with. Skipping decision endpoint test.');
  }

  console.log('\n--- SECURITY TEST COMPLETE ---');
}

testSecurityFix();
