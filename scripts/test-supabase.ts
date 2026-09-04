import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function test() {
  console.log('Testing Supabase connection with URL:', url);
  const { data, error } = await supabase.from('products').select('*').limit(1);
  console.log('Select products result:', { data, error });
}

test();
