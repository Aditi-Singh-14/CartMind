import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runTests() {
  console.log('=== CARTMIND RECOMMENDATION AGENT TEST (TIERED CAP) ===\n');

  // Fetch customers and products for setup
  const { data: customers } = await supabase.from('customers').select('*');
  const { data: products } = await supabase.from('products').select('*');

  if (!customers || !products) {
    console.error('Failed to load customers or products');
    return;
  }

  const priya = customers.find(c => c.name === 'Priya Patel')!;
  const aarav = customers.find(c => c.name === 'Aarav Sharma')!;
  const rohan = customers.find(c => c.name === 'Rohan Mehta')!;

  const prodMap: Record<string, any> = {};
  products.forEach(p => { prodMap[p.name] = p; });

  // ------------------------------------------------------------------
  // TEST 1: REPLENISHMENT SIGNAL (20% Tier: Cart >= ₹2,000)
  // Priya Patel (overdue Sunscreen). Cart: Skillet + Knife = ₹5,398
  // Cap: 20% of ₹5,398 = ₹1,079. Candidate: Sunscreen (₹399) <= ₹1,079 => PASS
  // ------------------------------------------------------------------
  console.log('--- TEST 1: REPLENISHMENT SIGNAL (20% Tier) ---');
  const test1Cart = [
    prodMap['Pre-Seasoned Cast Iron Skillet 10-inch'].id,
    prodMap['Japanese Damascus Steel Chef Knife 8-inch'].id
  ];

  console.log(`Customer: ${priya.name} (${priya.id})`);
  console.log(`Cart: Cast Iron Skillet (₹1899) + Damascus Chef Knife (₹3499) | Total: ₹5,398`);

  const res1 = await fetch('http://localhost:3000/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: priya.id,
      cart: test1Cart
    })
  });

  const data1 = await res1.json();
  console.log('\n[API Response Test 1]:', JSON.stringify(data1, null, 2));

  if (data1.decision_id) {
    const { data: decRow1 } = await supabase
      .from('agent_decisions')
      .select('*')
      .eq('id', data1.decision_id)
      .single();
    console.log('\n[agent_decisions Row 1]:', JSON.stringify(decRow1, null, 2));
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // ------------------------------------------------------------------
  // TEST 2: CO-PURCHASE SIGNAL (20% Tier: Cart >= ₹2,000)
  // Aarav Sharma. Cart: Running Shoes (₹4999) + Running Vest (₹2499) = ₹7,498
  // Cap: 20% of ₹7,498 = ₹1,499. Candidate: Running Socks (₹799) <= ₹1,499 => PASS
  // ------------------------------------------------------------------
  console.log('--- TEST 2: CO-PURCHASE SIGNAL (20% Tier) ---');
  const test2Cart = [
    prodMap['Pro Nitro Running Shoes'].id,
    prodMap['Ultra-Light Hydration Running Vest'].id
  ];

  console.log(`Customer: ${aarav.name} (${aarav.id})`);
  console.log(`Cart: Pro Nitro Running Shoes (₹4999) + Ultra-Light Hydration Running Vest (₹2499) | Total: ₹7,498`);

  const res2 = await fetch('http://localhost:3000/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: aarav.id,
      cart: test2Cart
    })
  });

  const data2 = await res2.json();
  console.log('\n[API Response Test 2]:', JSON.stringify(data2, null, 2));

  if (data2.decision_id) {
    const { data: decRow2 } = await supabase
      .from('agent_decisions')
      .select('*')
      .eq('id', data2.decision_id)
      .single();
    console.log('\n[agent_decisions Row 2]:', JSON.stringify(decRow2, null, 2));
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // ------------------------------------------------------------------
  // TEST 3: SMALL CART REJECTION (10% Tier: Cart < ₹2,000)
  // Rohan Mehta. Cart: Organic Bamboo Cutting Board Set (₹1,199) < ₹2,000
  // Cap: 10% of ₹1,199 = ₹119.90 (~₹120)
  // Candidate: Cast Iron Skillet (₹1,899) / Chef Knife (₹3,499) => Exceeds ₹120 cap => REJECTED BY BOUNDS
  // ------------------------------------------------------------------
  console.log('--- TEST 3: SMALL CART REJECTION (10% Tier) ---');
  const test3Cart = [
    prodMap['Organic Bamboo Cutting Board Set'].id
  ];

  console.log(`Customer: ${rohan.name} (${rohan.id})`);
  console.log(`Cart: Organic Bamboo Cutting Board Set (₹1199) | Total: ₹1,199 (< ₹2,000 threshold)`);

  const res3 = await fetch('http://localhost:3000/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: rohan.id,
      cart: test3Cart
    })
  });

  const data3 = await res3.json();
  console.log('\n[API Response Test 3]:', JSON.stringify(data3, null, 2));

  if (data3.decision_id) {
    const { data: decRow3 } = await supabase
      .from('agent_decisions')
      .select('*')
      .eq('id', data3.decision_id)
      .single();
    console.log('\n[agent_decisions Row 3]:', JSON.stringify(decRow3, null, 2));
  }
}

runTests();
