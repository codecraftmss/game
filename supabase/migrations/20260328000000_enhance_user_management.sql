-- Add password column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;

-- Update handle_new_user to store password from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, status, password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'PENDING',
    COALESCE(NEW.raw_user_meta_data->>'password', '')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Create function to delete user from auth.users (requires SECURITY DEFINER)
-- This allows admins to completely remove a user
CREATE OR REPLACE FUNCTION public.delete_user_admin(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    -- Check if caller is admin
    IF NOT public.has_role(v_admin_id, 'admin') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: Admin access required');
    END IF;

    -- Delete from auth.users (cascades to public.profiles, etc.)
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
