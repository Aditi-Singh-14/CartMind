import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { seedDatabase } from './seed-data';
dotenv.config({ path: '.env.local' });

async function run() {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    console.log('Connecting to PostgreSQL database to apply migrations...');
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      
      const m1 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '01_schema.sql'), 'utf-8');
      console.log('Executing 01_schema.sql...');
      await client.query(m1);

      const m2 = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '02_schema_update.sql'), 'utf-8');
      console.log('Executing 02_schema_update.sql...');
      await client.query(m2);

      console.log('Migrations executed successfully via PostgreSQL.');
      await client.end();
    } catch (err: any) {
      console.error('Error applying migration via DB connection:', err.message);
      process.exit(1);
    }
  } else {
    console.log('No DATABASE_URL found, re-seeding existing schema via Supabase Admin SDK...');
  }

  await seedDatabase();
}

run();
