import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testGraphQL() {
  const query = `{
    __schema {
      types {
        name
      }
    }
  }`;

  const res = await fetch(`${url}/rest/v1/rpc/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({ query })
  });

  console.log('GraphQL status:', res.status);
  const data = await res.json();
  console.log('GraphQL data:', JSON.stringify(data).substring(0, 300));
}

testGraphQL();
