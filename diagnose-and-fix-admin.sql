-- ============================================
-- COMPLETE DIAGNOSTIC AND FIX FOR ADMIN ACCOUNT
-- ============================================

-- STEP 1: Find ALL existing users and profiles
SELECT 
  'STEP 1: All existing accounts' as step,
  u.id as user_id,
  u.email,
  u.email_confirmed_at IS NOT NULL as email_confirmed,
  p.name,
  p.phone,
  p.status,
  ur.role
FROM auth.users u
FULL OUTER JOIN profiles p ON u.id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
ORDER BY u.created_at DESC NULLS LAST;

-- ============================================
-- STEP 2: Delete EVERYTHING related to phone +91 7219358852
-- ============================================

-- First, find the user_id associated with this phone
DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get the user ID from the profile
  SELECT id INTO target_user_id
  FROM profiles
  WHERE phone = '+91 7219358852'
  LIMIT 1;
  
  IF target_user_id IS NOT NULL THEN
    -- Delete user_roles
    DELETE FROM user_roles WHERE user_id = target_user_id;
    RAISE NOTICE 'Deleted user_roles for user: %', target_user_id;
    
    -- Delete profile
    DELETE FROM profiles WHERE id = target_user_id;
    RAISE NOTICE 'Deleted profile for user: %', target_user_id;
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = target_user_id;
    RAISE NOTICE 'Deleted auth.users for user: %', target_user_id;
    
    RAISE NOTICE 'Complete cleanup done for phone +91 7219358852';
  ELSE
    RAISE NOTICE 'No existing account found for phone +91 7219358852';
  END IF;
END $$;

-- ============================================
-- STEP 3: Verify cleanup
-- ============================================
SELECT 
  'STEP 3: Verify cleanup - should return no rows' as step,
  *
FROM profiles
WHERE phone = '+91 7219358852';

-- ============================================
-- STEP 4: Create fresh admin account
-- ============================================
DO $$
DECLARE
  admin_phone TEXT := '+91 7219358852';
  admin_name TEXT := 'Admin';
  admin_password TEXT := 'Admin@123456';
  admin_email TEXT;
  new_user_id UUID;
BEGIN
  -- Generate email from phone
  admin_email := 'user' || regexp_replace(admin_phone, '[^0-9]', '', 'g') || '@royalstar.com';
  
  -- Create user in auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    admin_email,
    crypt(admin_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('name', admin_name, 'phone', admin_phone)
  ) RETURNING id INTO new_user_id;
  
  -- Create profile with APPROVED status
  INSERT INTO profiles (id, name, phone, status, approved_at)
  VALUES (new_user_id, admin_name, admin_phone, 'APPROVED', NOW());
  
  -- Assign admin role
  INSERT INTO user_roles (user_id, role)
  VALUES (new_user_id, 'admin');
  
  RAISE NOTICE '✅ Admin account created successfully!';
  RAISE NOTICE 'Phone: %', admin_phone;
  RAISE NOTICE 'Email: %', admin_email;
  RAISE NOTICE 'Password: %', admin_password;
  RAISE NOTICE 'Login at: http://localhost:8080/admin/login';
END $$;

-- ============================================
-- STEP 5: Final verification
-- ============================================
SELECT 
  'STEP 5: Final verification - admin account details' as step,
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
