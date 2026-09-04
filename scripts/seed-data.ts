import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 20 products across 4 categories (price in paise: ₹1 = 100 paise)
const SEED_PRODUCTS = [
  // Category 1: Running Gear
  { name: 'Pro Nitro Running Shoes', category: 'Running Gear', price: 499900, margin_flag: true, replenishment_cycle_days: null },
  { name: 'Seamless Anti-Blister Running Socks (3-Pack)', category: 'Running Gear', price: 79900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Ultra-Light Hydration Running Vest', category: 'Running Gear', price: 249900, margin_flag: true, replenishment_cycle_days: null },
  { name: 'Insulated Sport Water Bottle 750ml', category: 'Running Gear', price: 129900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Graduated Calf Compression Sleeves', category: 'Running Gear', price: 99900, margin_flag: false, replenishment_cycle_days: null },

  // Category 2: Kitchenware
  { name: 'Pre-Seasoned Cast Iron Skillet 10-inch', category: 'Kitchenware', price: 189900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Japanese Damascus Steel Chef Knife 8-inch', category: 'Kitchenware', price: 349900, margin_flag: true, replenishment_cycle_days: null },
  { name: 'Organic Bamboo Cutting Board Set', category: 'Kitchenware', price: 119900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Handheld Electric Milk Frother', category: 'Kitchenware', price: 69900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Airtight Glass Food Storage Containers (5-Pack)', category: 'Kitchenware', price: 159900, margin_flag: true, replenishment_cycle_days: null },

  // Category 3: Electronics Accessories
  { name: 'Ergonomic Wireless Vertical Mouse', category: 'Electronics Accessories', price: 229900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'USB-C 7-in-1 Aluminum Multiport Hub', category: 'Electronics Accessories', price: 299900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Custom RGB Mechanical Keyboard (Hot-swappable)', category: 'Electronics Accessories', price: 549900, margin_flag: true, replenishment_cycle_days: null },
  { name: 'Active Noise Cancelling Wireless Earbuds', category: 'Electronics Accessories', price: 399900, margin_flag: false, replenishment_cycle_days: null },
  { name: 'Premium Felt Desk Mat & Mouse Pad', category: 'Electronics Accessories', price: 149900, margin_flag: false, replenishment_cycle_days: null },

  // Category 4: Skincare (Consumables with replenishment cycles)
  { name: 'Vitamin C Brightening Serum 30ml', category: 'Skincare', price: 49900, margin_flag: false, replenishment_cycle_days: 60 },
  { name: 'Hydrating Sunscreen Fluid SPF50 PA++++', category: 'Skincare', price: 39900, margin_flag: false, replenishment_cycle_days: 45 },
  { name: 'Hyaluronic Acid Deep Hydration Gel Cream', category: 'Skincare', price: 45900, margin_flag: false, replenishment_cycle_days: 60 },
  { name: 'Gentle Foaming Amino Acid Facial Cleanser', category: 'Skincare', price: 34900, margin_flag: false, replenishment_cycle_days: 90 },
  { name: 'Niacinamide + Zinc Night Repair Cream', category: 'Skincare', price: 48900, margin_flag: false, replenishment_cycle_days: 75 }
];

const SEED_CUSTOMERS = [
  { name: 'Aarav Sharma' },
  { name: 'Priya Patel' },
  { name: 'Rohan Mehta' }
];

export async function seedDatabase() {
  console.log('--- START SEEDING CARTMIND DATABASE (WITH REPLENISHMENT) ---');

  // Clear existing tables
  await supabase.from('agent_decisions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 1. Insert Products
  console.log('Inserting products...');
  const { data: insertedProducts, error: prodErr } = await supabase
    .from('products')
    .insert(SEED_PRODUCTS)
    .select();

  if (prodErr) {
    console.error('Error inserting products:', prodErr);
    return;
  }
  console.log(`Successfully seeded ${insertedProducts.length} products.`);

  const prodMap: Record<string, any> = {};
  insertedProducts.forEach(p => {
    prodMap[p.name] = p;
  });

  // 2. Insert Customers
  console.log('Inserting customers...');
  const { data: insertedCustomers, error: custErr } = await supabase
    .from('customers')
    .insert(SEED_CUSTOMERS)
    .select();

  if (custErr) {
    console.error('Error inserting customers:', custErr);
    return;
  }
  console.log(`Successfully seeded ${insertedCustomers.length} customers.`);

  const aarav = insertedCustomers.find(c => c.name === 'Aarav Sharma')!;
  const priya = insertedCustomers.find(c => c.name === 'Priya Patel')!;
  const rohan = insertedCustomers.find(c => c.name === 'Rohan Mehta')!;

  // Dates for historical orders
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

  // 3. Past orders including replenishment history
  const orderDefs = [
    // Aarav Sharma - Running Gear Co-Purchase Pattern
    {
      customer_id: aarav.id,
      created_at: daysAgo(30),
      items: [
        { product: prodMap['Pro Nitro Running Shoes'], qty: 1 },
        { product: prodMap['Seamless Anti-Blister Running Socks (3-Pack)'], qty: 2 },
        { product: prodMap['Ultra-Light Hydration Running Vest'], qty: 1 }
      ]
    },
    {
      customer_id: aarav.id,
      created_at: daysAgo(15),
      items: [
        { product: prodMap['Insulated Sport Water Bottle 750ml'], qty: 1 },
        { product: prodMap['Graduated Calf Compression Sleeves'], qty: 1 }
      ]
    },

    // Priya Patel - Skincare Replenishment Overdue Pattern (bought Vitamin C Serum 70 days ago; cycle is 60 days => Overdue!)
    {
      customer_id: priya.id,
      created_at: daysAgo(70),
      items: [
        { product: prodMap['Vitamin C Brightening Serum 30ml'], qty: 1 },
        { product: prodMap['Hydrating Sunscreen Fluid SPF50 PA++++'], qty: 1 }
      ]
    },
    {
      customer_id: priya.id,
      created_at: daysAgo(20),
      items: [
        { product: prodMap['Pre-Seasoned Cast Iron Skillet 10-inch'], qty: 1 },
        { product: prodMap['Japanese Damascus Steel Chef Knife 8-inch'], qty: 1 },
        { product: prodMap['Organic Bamboo Cutting Board Set'], qty: 1 }
      ]
    },

    // Rohan Mehta - Electronics Co-Purchase Pattern
    {
      customer_id: rohan.id,
      created_at: daysAgo(40),
      items: [
        { product: prodMap['Custom RGB Mechanical Keyboard (Hot-swappable)'], qty: 1 },
        { product: prodMap['Ergonomic Wireless Vertical Mouse'], qty: 1 },
        { product: prodMap['USB-C 7-in-1 Aluminum Multiport Hub'], qty: 1 }
      ]
    },
    {
      customer_id: rohan.id,
      created_at: daysAgo(10),
      items: [
        { product: prodMap['Active Noise Cancelling Wireless Earbuds'], qty: 1 },
        { product: prodMap['Premium Felt Desk Mat & Mouse Pad'], qty: 1 }
      ]
    }
  ];

  console.log('Inserting orders & order items...');
  for (const oDef of orderDefs) {
    const totalAmount = oDef.items.reduce((sum, item) => sum + item.product.price * item.qty, 0);

    const { data: insertedOrder, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_id: oDef.customer_id,
        total_amount: totalAmount,
        status: 'completed',
        created_at: oDef.created_at
      })
      .select()
      .single();

    if (orderErr) {
      console.error('Error inserting order:', orderErr);
      continue;
    }

    const orderItems = oDef.items.map(item => ({
      order_id: insertedOrder.id,
      product_id: item.product.id,
      quantity: item.qty,
      unit_price: item.product.price
    }));

    const { error: itemErr } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemErr) {
      console.error('Error inserting order items:', itemErr);
    }
  }

  console.log('--- SEEDING COMPLETED SUCCESSFULLY ---');
}

if (require.main === module) {
  seedDatabase();
}
