import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testDemoRecommendations() {
  console.log('--- LIVE TEST: DEMO ACCOUNT RECOMMENDATION ENGINE ---');

  // 1. First, check what products exist in the database
  const { data: allProducts } = await supabase
    .from('products')
    .select('*')
    .order('category', { ascending: true });

  console.log('--- Available Products ---');
  const productsByCategory: Record<string, any[]> = {};
  allProducts?.forEach(p => {
    if (!productsByCategory[p.category]) productsByCategory[p.category] = [];
    productsByCategory[p.category].push(p);
  });

  Object.keys(productsByCategory).forEach(category => {
    console.log(`\n${category}:`);
    productsByCategory[category].forEach(p => {
      console.log(`  - ${p.name} - ₹${p.price / 100} - Replenishment: ${p.replenishment_cycle_days || 'N/A'} days`);
    });
  });

  // 2. Create demo account with order history
  const demoEmail = `demo-${Date.now()}@example.com`;
  const demoPassword = 'DemoPassword123!';
  
  console.log(`\nCreating demo account: ${demoEmail}`);
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: demoEmail,
    password: demoPassword
  });

  if (authError) {
    console.error('Error creating demo user:', authError);
    return;
  }

  const userId = authData.user?.id;
  console.log(`✓ Demo user created: ${userId}`);

  // 3. Create customer record
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .insert({ name: 'Demo Customer', user_id: userId })
    .select()
    .single();

  if (custError) {
    console.error('Error creating customer:', custError);
    return;
  }

  console.log(`✓ Customer record created: ${customer.id}`);

  // 4. Create historical orders with skincare products (for replenishment)
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

  const skincareProducts = productsByCategory['Skincare'] || [];
  const runningGearProducts = productsByCategory['Running Gear'] || [];

  if (skincareProducts.length === 0) {
    console.log('\n⚠ No skincare products found - replenishment recommendations will not work');
  }

  // Create historical orders
  const orderDefs = [
    // Order 1: Skincare items 70 days ago (replenishment should trigger)
    ...(skincareProducts.length >= 2 ? [{
      customer_id: customer.id,
      created_at: daysAgo(70),
      items: skincareProducts.slice(0, 2).map(p => ({ product: p, qty: 1 }))
    }] : []),
    // Order 2: Running gear 30 days ago (co-purchase should trigger)
    ...(runningGearProducts.length >= 2 ? [{
      customer_id: customer.id,
      created_at: daysAgo(30),
      items: runningGearProducts.slice(0, 2).map(p => ({ product: p, qty: 1 }))
    }] : []),
    // Order 3: Mixed items 15 days ago
    ...(allProducts && allProducts.length >= 2 ? [{
      customer_id: customer.id,
      created_at: daysAgo(15),
      items: [allProducts[0], allProducts[1]].map(p => ({ product: p, qty: 1 }))
    }] : [])
  ];

  console.log('\n--- Creating historical orders ---');
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

    console.log(`✓ Order created: ${insertedOrder.id} (${oDef.created_at}) - ₹${totalAmount / 100}`);

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

  // 5. Check the customer's order history
  console.log('\n--- Checking customer order history ---');
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, created_at, total_amount, order_items(product_id, products(name, category, price, replenishment_cycle_days))')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('Error fetching orders:', ordersError);
  } else {
    console.log(`Total orders: ${orders.length}`);
    orders.forEach((order: any, idx: number) => {
      console.log(`\nOrder ${idx + 1}: ${order.id}`);
      console.log(`  Date: ${order.created_at}`);
      console.log(`  Total: ₹${order.total_amount / 100}`);
      console.log(`  Items:`);
      order.order_items.forEach((item: any) => {
        const product = item.products;
        console.log(`    - ${product.name} (${product.category}) - ₹${product.price / 100} - Replenishment: ${product.replenishment_cycle_days || 'N/A'} days`);
      });
    });
  }

  // 6. Sign in to get auth token
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword
  });

  if (signInError) {
    console.error('Error signing in:', signInError);
    return;
  }

  const accessToken = signInData.session?.access_token;
  console.log('\n✓ Signed in successfully');

  // 7. Add 2 items to cart and call /api/recommend
  console.log('\n--- Testing recommendations with 2 cart items ---');
  
  if (!allProducts || allProducts.length < 2) {
    console.log('Not enough products in database for cart test');
    return;
  }
  
  const cartProduct1 = allProducts[0];
  const cartProduct2 = allProducts[1];
  
  console.log(`Cart item 1: ${cartProduct1.name} (${cartProduct1.category}) - ₹${cartProduct1.price / 100}`);
  console.log(`Cart item 2: ${cartProduct2.name} (${cartProduct2.category}) - ₹${cartProduct2.price / 100}`);
  console.log(`Cart total: ₹${(cartProduct1.price + cartProduct2.price) / 100}`);

  try {
    const response = await fetch('http://localhost:3000/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        cart: [cartProduct1.id, cartProduct2.id]
      })
    });

    const data = await response.json();
    console.log(`\nStatus: ${response.status}`);
    console.log(`Recommendations returned: ${data.recommendations?.length || 0}`);
    console.log(`Bound check passed: ${data.bound_check_passed}`);

    if (data.recommendations && data.recommendations.length > 0) {
      console.log('\n--- Recommendation Details ---');
      data.recommendations.forEach((rec: any, idx: number) => {
        console.log(`\nRecommendation ${idx + 1}:`);
        console.log(`  Product: ${rec.candidate?.name}`);
        console.log(`  Signal type: ${rec.signal_type}`);
        console.log(`  Reasoning: ${rec.reasoning}`);
        console.log(`  Bound check passed: ${rec.bound_check_passed}`);
        console.log(`  Bound check rule: ${rec.bound_check_rule}`);
      });
    } else {
      console.log('\nNo recommendations returned. Analyzing why...');
      
      // Analyze why no recommendations
      const cartTotal = cartProduct1.price + cartProduct2.price;
      const threshold = 200000; // ₹2,000 in paise
      const tierPercentage = cartTotal >= threshold ? 0.20 : 0.10;
      const maxAllowedPrice = Math.floor(tierPercentage * cartTotal);
      
      console.log(`Cart total: ₹${cartTotal / 100}`);
      console.log(`Tier: ${cartTotal >= threshold ? '20%' : '10%'}`);
      console.log(`Max allowed candidate price: ₹${maxAllowedPrice / 100}`);
      
      // Check replenishment candidates
      console.log('\n--- Checking replenishment candidates ---');
      let replenishmentCount = 0;
      for (const order of orders || []) {
        for (const item of order.order_items || []) {
          const product = item.products as any;
          if (product.replenishment_cycle_days) {
            replenishmentCount++;
            const orderDate = new Date(order.created_at);
            const daysSincePurchase = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
            const daysOverdue = daysSincePurchase - product.replenishment_cycle_days;
            
            console.log(`  ${product.name}:`);
            console.log(`    Cycle: ${product.replenishment_cycle_days} days`);
            console.log(`    Days since purchase: ${daysSincePurchase}`);
            console.log(`    Days overdue: ${daysOverdue}`);
            console.log(`    Price: ₹${product.price / 100}`);
            console.log(`    Within bound: ${product.price <= maxAllowedPrice}`);
            console.log(`    Already in cart: ${[cartProduct1.id, cartProduct2.id].includes(product.id)}`);
          }
        }
      }
      if (replenishmentCount === 0) {
        console.log('  No products with replenishment cycles found in order history');
      }
      
      // Check co-purchase candidates
      console.log('\n--- Checking co-purchase candidates ---');
      const cartProductIds = [cartProduct1.id, cartProduct2.id];
      const cartCategories = [cartProduct1.category, cartProduct2.category];
      console.log(`Cart categories: ${cartCategories.join(', ')}`);
      console.log(`Cart product IDs: ${cartProductIds.join(', ')}`);
      
      // Check which products could be co-purchase candidates
      console.log('\nPotential co-purchase candidates (same category):');
      allProducts?.forEach(p => {
        if (cartCategories.includes(p.category) && !cartProductIds.includes(p.id)) {
          console.log(`  ${p.name} - ₹${p.price / 100} - Within bound: ${p.price <= maxAllowedPrice}`);
        }
      });
    }
  } catch (error) {
    console.error('Error testing recommendations:', error);
  }

  console.log('\n--- TEST COMPLETE ---');
  console.log(`Demo email: ${demoEmail}`);
  console.log(`Demo password: ${demoPassword}`);
}

testDemoRecommendations();
