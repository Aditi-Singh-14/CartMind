import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const projectRef = 'uovjnurlkxdjtdzlgomj';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Try multiple connection strings
const connectionStrings = [
  process.env.DATABASE_URL,
  `postgres://postgres.${projectRef}:${serviceKey}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres.${projectRef}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`,
  `postgresql://postgres:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`,
].filter(Boolean) as string[];

async function testPG() {
  for (const conn of connectionStrings) {
    console.log('Testing connection string (masked key):', conn.replace(serviceKey, '***KEY***'));
    const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const res = await client.query('SELECT current_database(), version();');
      console.log('SUCCESS! Result:', res.rows[0]);
      await client.end();
      return conn;
    } catch (err: any) {
      console.log('Failed:', err.message);
    }
  }
}

testPG();
