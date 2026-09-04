import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function debug() {
  const { data: customers } = await supabase.from('customers').select('*');
  const priya = customers?.find(c => c.name === 'Priya Patel');

  console.log('Priya ID:', priya?.id);

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      created_at,
      order_items (
        product_id,
        products (*)
      )
    `)
    .eq('customer_id', priya?.id);

  console.log('Orders query error:', error);
  console.log('Orders query result:', JSON.stringify(orders, null, 2));
}

debug();
