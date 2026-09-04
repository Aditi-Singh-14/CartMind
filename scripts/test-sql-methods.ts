import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const projectRef = 'uovjnurlkxdjtdzlgomj';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const url = `https://${projectRef}.supabase.co`;

async function testSqlMethods() {
  const query = `
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC NOT NULL,
      margin_flag BOOLEAN DEFAULT false NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now() NOT NULL
    );
  `;

  // Try method 1: Management API SQL endpoint
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ query })
    });
    console.log('Management API /sql:', res.status, await res.text());
  } catch (e: any) {
    console.log('Management API error:', e.message);
  }

  // Try method 2: Project /sql endpoint
  try {
    const res = await fetch(`${url}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey
      },
      body: JSON.stringify({ query })
    });
    console.log('Project /sql:', res.status, await res.text());
  } catch (e: any) {
    console.log('Project /sql error:', e.message);
  }

  // Try method 3: Project /rest/v1/ SQL execution
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'X-Client-Info': 'supabase-js'
      },
      body: JSON.stringify({ query })
    });
    console.log('Project /rest/v1/ POST:', res.status, await res.text());
  } catch (e: any) {
    console.log('Project /rest/v1/ POST error:', e.message);
  }
}

testSqlMethods();
