-- ============================================
-- CREATE ADMIN ACCOUNT - FINAL WORKING VERSION
-- ============================================
-- This version works WITH the trigger, not against it

DO $$
DECLARE
  admin_phone TEXT := '+91 7219358852';
  admin_name TEXT := 'Admin';
  admin_password TEXT := 'Admin@123456';
  admin_email TEXT;
  new_user_id UUID;
  existing_user_id UUID;
BEGIN
  -- Generate email from phone
  admin_email := 'user' || regexp_replace(admin_phone, '[^0-9]', '', 'g') || '@royalstar.com';
  
  -- Check if user already exists
  SELECT p.id INTO existing_user_id
  FROM profiles p
  WHERE p.phone = admin_phone;
  
  IF existing_user_id IS NOT NULL THEN
    -- User exists, just update it
    RAISE NOTICE 'User already exists, updating...';
    
    -- Update password
    UPDATE auth.users
    SET encrypted_password = crypt(admin_password, gen_salt('bf')),
        email_confirmed_at = NOW()
    WHERE id = existing_user_id;
    
    -- Update profile to APPROVED
    UPDATE profiles
    SET status = 'APPROVED',
        approved_at = NOW(),
        name = admin_name
    WHERE id = existing_user_id;
    
    -- Ensure admin role exists
    INSERT INTO user_roles (user_id, role)
    VALUES (existing_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Remove user role if exists
    DELETE FROM user_roles 
    WHERE user_id = existing_user_id AND role = 'user';
    
    new_user_id := existing_user_id;
    
  ELSE
    -- User doesn't exist, create new one
    RAISE NOTICE 'Creating new admin user...';
    
    -- Temporarily disable the trigger
    ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
    
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
    
    -- Re-enable the trigger
    ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
    
    -- Manually create profile with APPROVED status
    INSERT INTO profiles (id, name, phone, status, approved_at)
    VALUES (new_user_id, admin_name, admin_phone, 'APPROVED', NOW());
    
    -- Assign admin role
    INSERT INTO user_roles (user_id, role)
    VALUES (new_user_id, 'admin');
    
  END IF;
  
  RAISE NOTICE '✅ Admin account ready!';
  RAISE NOTICE 'Phone: %', admin_phone;
  RAISE NOTICE 'Email: %', admin_email;
  RAISE NOTICE 'Password: %', admin_password;
  RAISE NOTICE 'Login at: http://localhost:8080/admin/login';
  
END $$;

-- Verify the admin account
SELECT 
  'Admin account verification' as status,
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
