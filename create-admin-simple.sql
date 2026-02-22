-- ============================================
-- SIMPLE ADMIN ACCOUNT SETUP
-- ============================================
-- This works with the existing trigger system

DO $$
DECLARE
  admin_phone TEXT := '+91 7219358852';
  admin_name TEXT := 'Admin';
  admin_password TEXT := 'Admin@123456';
  admin_email TEXT;
  target_user_id UUID;
BEGIN
  -- Generate email from phone
  admin_email := 'user' || regexp_replace(admin_phone, '[^0-9]', '', 'g') || '@royalstar.com';
  
  -- Find existing user by phone
  SELECT p.id INTO target_user_id
  FROM profiles p
  WHERE p.phone = admin_phone;
  
  IF target_user_id IS NOT NULL THEN
    -- User exists, update it
    RAISE NOTICE 'Found existing user, updating credentials...';
    
    -- Update password and confirm email
    UPDATE auth.users
    SET encrypted_password = crypt(admin_password, gen_salt('bf')),
        email_confirmed_at = NOW()
    WHERE id = target_user_id;
    
    -- Update profile to APPROVED
    UPDATE profiles
    SET status = 'APPROVED',
        approved_at = NOW(),
        name = admin_name
    WHERE id = target_user_id;
    
    -- Add admin role (ignore if already exists)
    INSERT INTO user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE '✅ Admin account updated successfully!';
    
  ELSE
    RAISE NOTICE '❌ No account found with phone: %', admin_phone;
    RAISE NOTICE 'Please create an account first by signing up at the app, then run this script.';
    RAISE NOTICE 'OR use the Supabase dashboard to create a user manually.';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Login credentials:';
  RAISE NOTICE 'Phone: %', admin_phone;
  RAISE NOTICE 'Password: %', admin_password;
  RAISE NOTICE 'Login at: http://localhost:8080/admin/login';
  
END $$;

-- Verify the result
SELECT 
  'Verification' as status,
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
