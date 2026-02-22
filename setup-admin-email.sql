-- ============================================
-- CREATE ADMIN ACCOUNT WITH REAL EMAIL
-- ============================================
-- Admin uses email directly (NOT phone-based)
-- This keeps admin auth completely separate from user auth
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" → "Create new user"
-- 3. Email: admin@royalstar.com
-- 4. Password: Admin@123456
-- 5. Click "Create User"
-- 6. Copy the User ID shown
-- 7. Replace YOUR_USER_ID_HERE below with that ID
-- 8. Run this SQL
-- ============================================

-- After creating the user in Supabase Dashboard, run this:
DO $$
DECLARE
  target_id UUID := 'YOUR_USER_ID_HERE'; -- Replace with actual user ID from Supabase Dashboard
BEGIN
  -- Update the profile (trigger auto-created it with PENDING status)
  UPDATE profiles
  SET status = 'APPROVED',
      approved_at = NOW(),
      name = 'Admin',
      phone = '+91 7219358852'
  WHERE id = target_id;

  -- Remove the default 'user' role assigned by trigger
  DELETE FROM user_roles
  WHERE user_id = target_id AND role = 'user';

  -- Add admin role
  INSERT INTO user_roles (user_id, role)
  VALUES (target_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE '✅ Admin role assigned successfully!';
  RAISE NOTICE 'Login at: /admin/login';
  RAISE NOTICE 'Email: admin@royalstar.com';
  RAISE NOTICE 'Password: Admin@123456';
END $$;

-- Verify
SELECT
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  p.name,
  p.phone,
  p.status,
  ur.role
FROM auth.users u
JOIN profiles p ON u.id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'admin@royalstar.com';
