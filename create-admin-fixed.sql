-- ============================================
-- CREATE ADMIN ACCOUNT - FIXED VERSION
-- ============================================
-- This version works with Supabase's constraints

DO $$
DECLARE
  admin_phone TEXT := '+91 7219358852';  -- CHANGE THIS to your phone
  admin_name TEXT := 'Mujjamil Admin';   -- CHANGE THIS to your name
  admin_password TEXT := 'Admin@123456'; -- CHANGE THIS to your password
  admin_email TEXT;
  new_user_id UUID;
BEGIN
  -- Generate email from phone
  admin_email := 'user' || regexp_replace(admin_phone, '[^0-9]', '', 'g') || '@royalstar.com';
  
  -- Create user in auth.users (without confirmed_at - let it use DEFAULT)
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
  
  RAISE NOTICE 'Admin created successfully!';
  RAISE NOTICE 'Phone: %', admin_phone;
  RAISE NOTICE 'Password: %', admin_password;
  RAISE NOTICE 'Login at: http://localhost:8080/admin/login';
END $$;
