-- ============================================
-- CREATE ADMIN ACCOUNT DIRECTLY IN SUPABASE
-- ============================================
-- This script creates an admin account without using the signup form
-- Admin accounts can only be created by running this SQL in Supabase

-- INSTRUCTIONS:
-- 1. Replace the values below with your desired admin credentials
-- 2. Run this SQL in Supabase SQL Editor
-- 3. The admin can then login at /admin/login

-- ============================================
-- CONFIGURATION - CHANGE THESE VALUES
-- ============================================
-- Admin phone number (used for login)
DO $$
DECLARE
  admin_phone TEXT := '+91 9876543210';  -- CHANGE THIS
  admin_name TEXT := 'Super Admin';      -- CHANGE THIS
  admin_password TEXT := 'Admin@123456'; -- CHANGE THIS (min 8 chars)
  admin_email TEXT;
  new_user_id UUID;
BEGIN
  -- Generate email from phone
  admin_email := 'user' || regexp_replace(admin_phone, '[^0-9]', '', 'g') || '@royalstar.com';
  
  -- Step 1: Create user in auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmed_at,
    created_at,
    updated_at,
    raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    admin_email,
    crypt(admin_password, gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    NOW(),
    jsonb_build_object('name', admin_name, 'phone', admin_phone)
  ) RETURNING id INTO new_user_id;
  
  -- Step 2: Create profile (APPROVED status)
  INSERT INTO profiles (id, name, phone, status, approved_at)
  VALUES (new_user_id, admin_name, admin_phone, 'APPROVED', NOW());
  
  -- Step 3: Assign admin role
  INSERT INTO user_roles (user_id, role)
  VALUES (new_user_id, 'admin');
  
  -- Step 4: Show success message
  RAISE NOTICE 'Admin account created successfully!';
  RAISE NOTICE 'Phone: %', admin_phone;
  RAISE NOTICE 'Email: %', admin_email;
  RAISE NOTICE 'Password: %', admin_password;
  RAISE NOTICE 'Login at: /admin/login';
END $$;

-- ============================================
-- VERIFY ADMIN WAS CREATED
-- ============================================
SELECT 
  u.email,
  p.name,
  p.phone,
  p.status,
  ur.role,
  u.email_confirmed_at IS NOT NULL as email_confirmed
FROM auth.users u
JOIN profiles p ON u.id = p.id
JOIN user_roles ur ON u.id = ur.user_id
WHERE ur.role = 'admin'
ORDER BY u.created_at DESC
LIMIT 5;
