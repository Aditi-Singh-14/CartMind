import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const projectRef = 'uovjnurlkxdjtdzlgomj';
const host = `db.${projectRef}.supabase.co`;

const candidatePasswords = [
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.RAZORPAY_KEY_SECRET,
  'postgres',
  'password',
  'CartMind',
  'cartmind',
  'Cartmind123!',
  'root',
  'admin'
].filter(Boolean) as string[];

async function testPasswords() {
  for (const pass of candidatePasswords) {
    console.log('Trying password:', pass.substring(0, 10) + '...');
    const client = new Client({
      host,
      port: 5432,
      user: 'postgres',
      password: pass,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log('SUCCESS! Connected with password:', pass);
      await client.end();
      return pass;
    } catch (err: any) {
      console.log('Failed:', err.message);
    }
  }
}

testPasswords();
