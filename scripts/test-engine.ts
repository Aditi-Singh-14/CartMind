import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { getRecommendation } from '../lib/recommendation/engine';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testDirectEngine() {
  console.log('--- DIRECT ENGINE TEST ---');
  const { data: customers } = await supabase.from('customers').select('*');
  const { data: products } = await supabase.from('products').select('*');

  const priya = customers?.find(c => c.name === 'Priya Patel')!;
  const aarav = customers?.find(c => c.name === 'Aarav Sharma')!;

  const prodMap: Record<string, any> = {};
  products?.forEach(p => { prodMap[p.name] = p; });

  // Test 1: Priya (Replenishment)
  const cart1 = [
    prodMap['Pre-Seasoned Cast Iron Skillet 10-inch'].id,
    prodMap['Japanese Damascus Steel Chef Knife 8-inch'].id
  ];

  console.log('Testing Priya Patel (Replenishment)...');
  const rec1 = await getRecommendation(priya.id, cart1);
  console.log('Rec 1 Result:', JSON.stringify(rec1, null, 2));

  // Test 2: Aarav (Co-Purchase)
  const cart2 = [
    prodMap['Pro Nitro Running Shoes'].id,
    prodMap['Ultra-Light Hydration Running Vest'].id
  ];

  console.log('\nTesting Aarav Sharma (Co-Purchase)...');
  const rec2 = await getRecommendation(aarav.id, cart2);
  console.log('Rec 2 Result:', JSON.stringify(rec2, null, 2));
}

testDirectEngine();
