import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function inspect() {
  const res = await fetch(url, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  console.log('OpenAPI spec status:', res.status);
  const data = await res.json();
  console.log('Definitions/Tables in OpenAPI spec:', Object.keys(data.definitions || {}));
  console.log('Paths/RPCs in OpenAPI spec:', Object.keys(data.paths || {}));
}

inspect();
