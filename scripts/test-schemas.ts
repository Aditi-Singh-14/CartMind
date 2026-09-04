import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testSchemas() {
  const schemas = ['public', 'storage', 'auth', 'graphql_public', 'extensions'];
  for (const s of schemas) {
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Accept-Profile': s
        }
      });
      console.log(`Schema ${s} status:`, res.status);
      if (res.ok) {
        const data = await res.json();
        console.log(`Schema ${s} definitions:`, Object.keys(data.definitions || {}));
        console.log(`Schema ${s} paths:`, Object.keys(data.paths || {}));
      }
    } catch (e: any) {
      console.log(`Schema ${s} error:`, e.message);
    }
  }
}

testSchemas();
