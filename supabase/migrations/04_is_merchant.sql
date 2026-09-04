-- Migration 04: Add is_merchant column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_merchant BOOLEAN DEFAULT false NOT NULL;

-- Set is_merchant = true for designated merchant demo customer (e.g. Aarav Sharma)
UPDATE customers SET is_merchant = true WHERE name = 'Aarav Sharma';
