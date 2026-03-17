-- Migration: add membership_tier to profiles
-- Stores each user's membership tier (classic | pro | ultra)
--
-- USAGE: Replace 'ADMIN_EMAIL_HERE' with your actual admin email before running.
--        e.g. 'myname@gmail.com'

-- 1. Clean up any conflicting policies from previous runs
DROP POLICY IF EXISTS "admin_select_any_profile" ON profiles;
DROP POLICY IF EXISTS "admin_update_membership" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- 2. Add membership_tier column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'membership_tier'
  ) THEN
    ALTER TABLE profiles ADD COLUMN membership_tier TEXT NOT NULL DEFAULT 'classic';
    ALTER TABLE profiles ADD CONSTRAINT profiles_membership_tier_check
      CHECK (membership_tier IN ('classic', 'pro', 'ultra'));
  END IF;
END $$;

-- 3. RLS: admin can SELECT any profile; regular users only their own
--    ⚠️ REPLACE 'ADMIN_EMAIL_HERE' with your admin email!
CREATE POLICY "admin_select_any_profile" ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR (auth.jwt() ->> 'email') = 'ADMIN_EMAIL_HERE'
  );

-- 4. RLS: admin can UPDATE membership_tier on any profile
CREATE POLICY "admin_update_membership" ON profiles FOR UPDATE
  USING (
    auth.uid() = id
    OR (auth.jwt() ->> 'email') = 'ADMIN_EMAIL_HERE'
  )
  WITH CHECK (
    auth.uid() = id
    OR (auth.jwt() ->> 'email') = 'ADMIN_EMAIL_HERE'
  );
