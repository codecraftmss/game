-- ============================================
-- STEP 1: Check what accounts exist
-- ============================================
SELECT 
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
WHERE p.phone LIKE '+91%'
ORDER BY u.created_at DESC;

-- ============================================
-- STEP 2: Reset password for existing account
-- ============================================
-- Run this AFTER checking the results above
-- This will set password to: Admin@12345

UPDATE auth.users
SET encrypted_password = crypt('Admin@12345', gen_salt('bf'))
WHERE email = 'user917219358852@royalstar.com';

-- ============================================
-- STEP 3: Ensure account is admin and approved
-- ============================================
-- Make sure the account has admin role
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'user917219358852@royalstar.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Approve the account
UPDATE profiles 
SET status = 'APPROVED', approved_at = NOW()
WHERE phone = '+91 7219358852';

-- Confirm email
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'user917219358852@royalstar.com'
AND email_confirmed_at IS NULL;

-- ============================================
-- STEP 4: Verify everything is set
-- ============================================
SELECT 
  'FINAL CHECK' as status,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  p.name,
  p.phone,
  p.status,
  ur.role
FROM auth.users u
JOIN profiles p ON u.id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE p.phone = '+91 7219358852';

-- ============================================
-- EXPECTED RESULT:
-- email_confirmed: true
-- status: APPROVED
-- role: admin
-- 
-- THEN LOGIN WITH:
-- Phone: +91 7219358852
-- Password: Admin@12345
-- ============================================
