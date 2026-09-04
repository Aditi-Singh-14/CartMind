import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
console.log('ENV KEYS:', Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('POSTGRES') || k.includes('DB') || k.includes('RAZORPAY')));
