-- Migration 02: Add replenishment_cycle_days to products and signal_type to agent_decisions

ALTER TABLE products ADD COLUMN IF NOT EXISTS replenishment_cycle_days INTEGER;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS signal_type TEXT;
