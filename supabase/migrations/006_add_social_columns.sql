-- Add social media columns to users table
-- These columns are used in profile setup and profile display

ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok_url TEXT; 