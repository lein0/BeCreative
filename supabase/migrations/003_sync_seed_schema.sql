-- Migration to sync schema with seed script

-- USERS
ALTER TABLE users RENAME COLUMN name TO full_name;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;

-- INSTRUCTORS
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- CLASSES
ALTER TABLE classes RENAME COLUMN capacity TO max_students;
ALTER TABLE classes RENAME COLUMN start_date TO scheduled_at;
ALTER TABLE classes ALTER COLUMN price_dollars TYPE NUMERIC USING price_dollars::NUMERIC;

-- BOOKINGS
ALTER TABLE bookings RENAME COLUMN used_credits TO credits_used;
ALTER TABLE bookings RENAME COLUMN paid_amount TO amount_paid;

-- REVIEWS
ALTER TABLE reviews RENAME COLUMN reviewer_id TO user_id;
ALTER TABLE reviews RENAME COLUMN text TO comment;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id);

-- SUBSCRIPTIONS
ALTER TABLE subscriptions RENAME COLUMN tier TO plan_type;
ALTER TABLE subscriptions RENAME COLUMN credits_total TO credits_per_month;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status TEXT; 