import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function createTestUserAndTestCheckout() {
  console.log('--- LIVE TEST 1: CHECKOUT WITH ZERO RECOMMENDATIONS ---');

  // 1. Create a test user
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  
  console.log(`Creating test user: ${testEmail}`);
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword
  });

  if (authError) {
    console.error('Error creating test user:', authError);
    return;
  }

  console.log('✓ Test user created');
  const userId = authData.user?.id;
  console.log(`User ID: ${userId}`);

  // 2. Create customer record
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .insert({ name: 'Test User', user_id: userId })
    .select()
    .single();

  if (custError) {
    console.error('Error creating customer:', custError);
    return;
  }

  console.log('✓ Customer record created');
  console.log(`Customer ID: ${customer.id}`);

  // 3. Get a low-value product (under ₹1,000)
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .lt('price', 100000) // Under ₹1,000 (100,000 paise)
    .limit(1);

  if (!products || products.length === 0) {
    console.error('No low-value products found');
    return;
  }

  const lowValueProduct = products[0];
  console.log(`✓ Low-value product found: ${lowValueProduct.name} (₹${lowValueProduct.price / 100})`);

  // 4. Sign in to get auth token
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

  // 5. Test cart-only checkout via API
  console.log('\n--- Testing cart-only checkout API ---');
  try {
    const checkoutResponse = await fetch('http://localhost:3000/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        cart: [lowValueProduct.id]
      })
    });

    const checkoutData = await checkoutResponse.json();
    console.log(`Status: ${checkoutResponse.status}`);
    console.log(`Response:`, JSON.stringify(checkoutData, null, 2));

    if (checkoutResponse.status === 200 && checkoutData.razorpay_order_id) {
      console.log('✓ CHECKOUT SUCCESS: Razorpay order created');
      console.log(`Razorpay Order ID: ${checkoutData.razorpay_order_id}`);
      console.log(`Total Amount: ₹${checkoutData.total_amount_inr}`);
    } else {
      console.log('✗ CHECKOUT FAILED');
    }
  } catch (error) {
    console.error('Error testing checkout:', error);
  }

  // 6. Test recommendations with this cart (should have zero passing recommendations)
  console.log('\n--- Testing recommendations with low-value cart ---');
  try {
    const recResponse = await fetch('http://localhost:3000/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        cart: [lowValueProduct.id]
      })
    });

    const recData = await recResponse.json();
    console.log(`Status: ${recResponse.status}`);
    console.log(`Recommendations:`, recData.recommendations?.length || 0);
    console.log(`Bound check passed: ${recData.bound_check_passed}`);
    
    if (recData.recommendations?.length === 0 || !recData.bound_check_passed) {
      console.log('✓ As expected: Zero passing recommendations for low-value cart');
    }
  } catch (error) {
    console.error('Error testing recommendations:', error);
  }

  console.log('\n--- TEST 1 COMPLETE ---');
  console.log(`Test user email: ${testEmail}`);
  console.log(`Test user password: ${testPassword}`);
  console.log('You can now log in to the browser and test the checkout flow manually.');
}

createTestUserAndTestCheckout();
