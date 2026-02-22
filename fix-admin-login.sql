-- ============================================
-- DIAGNOSTIC & FIX SQL FOR ADMIN LOGIN
-- Run this in Supabase SQL Editor
-- ============================================

-- STEP 1: Check current state of your account
-- This will show if email is confirmed and what roles you have
SELECT 
  'Current Account State' as check_type,
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at,
  p.name,
  p.phone,
  p.status,
  ur.role
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'user917219358852@royalstar.com';

-- STEP 2: Force confirm the email (THIS IS THE KEY FIX)
UPDATE auth.users 
SET 
  email_confirmed_at = NOW(),
  confirmed_at = NOW()
WHERE email = 'user917219358852@royalstar.com'
AND email_confirmed_at IS NULL;

-- STEP 3: Ensure admin role exists
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'::app_role 
FROM auth.users 
WHERE email = 'user917219358852@royalstar.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- STEP 4: Approve the profile
UPDATE profiles 
SET 
  status = 'APPROVED'::user_status,
  approved_at = NOW()
WHERE phone = '+91 7219358852';

-- STEP 5: Verify everything is fixed
SELECT 
  'After Fix - Verification' as check_type,
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  p.name,
  p.phone,
  p.status,
  ur.role
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'user917219358852@royalstar.com';

-- ============================================
-- EXPECTED RESULTS:
-- email_confirmed: true
-- status: APPROVED
-- role: admin
-- ============================================
