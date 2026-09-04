import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runApprovalCheckoutTests() {
  console.log('=== CARTMIND APPROVAL GATE & RAZORPAY MCP TOOL CHECKOUT TEST ===\n');

  // Fetch customers and products for setting up fresh decision
  const { data: customers } = await supabase.from('customers').select('*');
  const { data: products } = await supabase.from('products').select('*');

  const aarav = customers?.find(c => c.name === 'Aarav Sharma')!;
  const prodMap: Record<string, any> = {};
  products?.forEach(p => { prodMap[p.name] = p; });

  // Fetch existing decision records from DB dynamically
  const { data: dbDecisions } = await supabase.from('agent_decisions').select('id, bound_check_passed').order('timestamp', { ascending: false });
  const failedDecision = dbDecisions?.find(d => d.bound_check_passed === false);
  const passedDecision = dbDecisions?.find(d => d.bound_check_passed === true);

  const failedDecisionId = failedDecision ? failedDecision.id : '795b159d-bf2c-4537-9468-3cb95338b012';
  const replenishmentDecisionId = passedDecision ? passedDecision.id : '6f8f6f08-9352-461a-9510-b5e82eeed2fd';

  // ------------------------------------------------------------------
  // TEST 1: INDEPENDENT GATE RE-VALIDATION (403 FORBIDDEN)
  // ------------------------------------------------------------------
  console.log('--- TEST 1: APPROVAL GATE RE-VALIDATION (403 FORBIDDEN) ---');
  console.log(`Target Decision ID (Failed Bounds): ${failedDecisionId}`);

  const res1 = await fetch(`http://localhost:3000/api/decisions/${failedDecisionId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: 'approved' })
  });

  console.log(`HTTP Status: ${res1.status} (Expected: 403)`);
  const data1 = await res1.json();
  console.log('[API Response Test 1]:', JSON.stringify(data1, null, 2));

  console.log('\n' + '='.repeat(65) + '\n');

  // ------------------------------------------------------------------
  // TEST 2: USER REJECTION FLOW
  // ------------------------------------------------------------------
  console.log('--- TEST 2: USER REJECTION FLOW ---');
  console.log(`Target Decision ID (Passed Bounds): ${replenishmentDecisionId}`);

  const res2 = await fetch(`http://localhost:3000/api/decisions/${replenishmentDecisionId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: 'rejected' })
  });

  console.log(`HTTP Status: ${res2.status} (Expected: 200)`);
  const data2 = await res2.json();
  console.log('[API Response Test 2]:', JSON.stringify(data2, null, 2));

  console.log('\n' + '='.repeat(65) + '\n');

  // ------------------------------------------------------------------
  // TEST 3: FRESH DECISION & RAZORPAY MCP TOOL CHECKOUT
  // 1. Generate fresh recommendation decision for Aarav Sharma (Running Gear cart)
  // 2. Approve decision via /api/decisions/[id]/respond
  // ------------------------------------------------------------------
  console.log('--- TEST 3: FRESH DECISION & RAZORPAY MCP TOOL CHECKOUT ---');

  const test3Cart = [
    prodMap['Pro Nitro Running Shoes'].id,
    prodMap['Ultra-Light Hydration Running Vest'].id
  ];

  console.log('Generating fresh recommendation decision...');
  const recRes = await fetch('http://localhost:3000/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: aarav.id,
      cart: test3Cart
    })
  });

  const recData = await recRes.json();
  const freshDecisionId = recData.decision_id;

  console.log(`Generated Fresh Decision ID: ${freshDecisionId}`);
  console.log(`Recommendation Candidate: ${recData.candidate.name} (Price: ₹${recData.candidate.price / 100})`);
  console.log(`Bound Check Passed: ${recData.bound_check_passed}`);

  console.log(`\nApproving fresh decision via /api/decisions/${freshDecisionId}/respond...`);
  const res3 = await fetch(`http://localhost:3000/api/decisions/${freshDecisionId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: 'approved' })
  });

  console.log(`HTTP Status: ${res3.status} (Expected: 200)`);
  const data3 = await res3.json();
  console.log('[API Response Test 3 (MCP Checkout)]:\n', JSON.stringify(data3, null, 2));

  // Verify updated agent_decisions record from Supabase
  const { data: decRow3 } = await supabase
    .from('agent_decisions')
    .select('*')
    .eq('id', freshDecisionId)
    .single();

  console.log('\n[Updated agent_decisions Row from Supabase]:\n', JSON.stringify(decRow3, null, 2));

  // Verify created order in orders table
  if (data3.razorpay_order_id) {
    const { data: createdOrder } = await supabase
      .from('orders')
      .select('*, order_items(*, products(*))')
      .eq('razorpay_order_id', data3.razorpay_order_id)
      .single();

    console.log('\n[Created Supabase Order & Order Items]:\n', JSON.stringify(createdOrder, null, 2));
  }
}

runApprovalCheckoutTests();
