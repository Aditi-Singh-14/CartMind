import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testEndpoints() {
  console.log('Testing SQL endpoint options for:', url);

  // 1. Test /pg/v1/query
  try {
    const res = await fetch(`${url}/pg/v1/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey
      },
      body: JSON.stringify({ query: 'SELECT version();' })
    });
    console.log('/pg/v1/query status:', res.status, await res.text());
  } catch (e: any) {
    console.log('/pg/v1/query error:', e.message);
  }

  // 2. Test /rest/v1/rpc
  try {
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey
      },
      body: JSON.stringify({ sql: 'SELECT 1;' })
    });
    console.log('/rest/v1/rpc/exec_sql status:', res.status, await res.text());
  } catch (e: any) {
    console.log('/rest/v1/rpc/exec_sql error:', e.message);
  }
}

testEndpoints();
