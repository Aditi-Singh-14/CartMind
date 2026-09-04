-- Migration 03: Add user_id to customers and enable Row Level Security (RLS)

-- 1. Add user_id foreign key linking customer to auth.users
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Enable RLS on core tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-applying migration
DROP POLICY IF EXISTS "products_public_select" ON products;
DROP POLICY IF EXISTS "customers_own_select" ON customers;
DROP POLICY IF EXISTS "customers_own_insert" ON customers;
DROP POLICY IF EXISTS "customers_own_update" ON customers;
DROP POLICY IF EXISTS "orders_own_all" ON orders;
DROP POLICY IF EXISTS "order_items_own_all" ON order_items;
DROP POLICY IF EXISTS "agent_decisions_own_all" ON agent_decisions;

-- 3. PRODUCTS: Public READ policy (unauthenticated catalog browsing allowed)
CREATE POLICY "products_public_select" ON products
  FOR SELECT USING (true);

-- 4. CUSTOMERS: Users can read, insert, and update their own customer record
CREATE POLICY "customers_own_select" ON customers
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "customers_own_insert" ON customers
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "customers_own_update" ON customers
  FOR UPDATE USING (user_id = auth.uid());

-- 5. ORDERS: Users can read, insert, update orders matching their linked customer record
CREATE POLICY "orders_own_all" ON orders
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- 6. ORDER_ITEMS: Users can read, insert, update order items for their orders
CREATE POLICY "order_items_own_all" ON order_items
  FOR ALL USING (
    order_id IN (
      SELECT o.id FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- 7. AGENT_DECISIONS: Users can read decisions for their own customer record
CREATE POLICY "agent_decisions_own_all" ON agent_decisions
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );
