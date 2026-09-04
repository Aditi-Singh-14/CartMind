import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verify() {
  console.log('=== VERIFYING SUPABASE TABLES ===\n');

  // 1. Products
  const { data: products } = await supabase.from('products').select('*');
  console.log(`[PRODUCTS] Count: ${products?.length}`);
  console.log('Sample Products:');
  console.log(products?.slice(0, 4));

  // 2. Customers
  const { data: customers } = await supabase.from('customers').select('*');
  console.log(`\n[CUSTOMERS] Count: ${customers?.length}`);
  console.log('Customers:', customers);

  // 3. Orders
  const { data: orders } = await supabase.from('orders').select('*');
  console.log(`\n[ORDERS] Count: ${orders?.length}`);
  console.log('Sample Orders:', orders?.slice(0, 3));

  // 4. Order Items
  const { data: orderItems } = await supabase.from('order_items').select('*');
  console.log(`\n[ORDER_ITEMS] Count: ${orderItems?.length}`);
  console.log('Sample Order Items:', orderItems?.slice(0, 4));

  // 5. Agent Decisions
  const { data: decisions } = await supabase.from('agent_decisions').select('*');
  console.log(`\n[AGENT_DECISIONS] Count: ${decisions?.length}`);

  console.log('\n=== TESTING CATALOG API LOGIC ===');
  const catalogJsonLd = (products || []).map((product) => ({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    '@id': `urn:cartmind:product:${product.id}`,
    'identifier': product.id,
    'name': product.name,
    'category': product.category,
    'marginFlag': product.margin_flag,
    'offers': {
      '@type': 'Offer',
      'priceCurrency': 'INR',
      'price': Number((product.price / 100).toFixed(2)),
      'priceInPaise': Number(product.price),
      'itemCondition': 'https://schema.org/NewCondition',
      'availability': 'https://schema.org/InStock',
    },
  }));

  console.log('\nSample JSON-LD Output (First 2 Items):');
  console.log(JSON.stringify(catalogJsonLd.slice(0, 2), null, 2));
}

verify();
