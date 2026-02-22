-- ============================================
-- FIX: Auto-confirm email when admin approves user
-- ============================================
-- This trigger fires whenever a profile status changes to APPROVED
-- It automatically confirms the email in auth.users so the user can login

CREATE OR REPLACE FUNCTION public.handle_user_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When status changes to APPROVED, confirm the user's email
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it already exists, then recreate
DROP TRIGGER IF EXISTS on_user_approved ON public.profiles;

CREATE TRIGGER on_user_approved
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_approval();

-- ============================================
-- Also fix all currently APPROVED users who can't login
-- ============================================
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE id IN (
  SELECT id FROM profiles WHERE status = 'APPROVED'
)
AND email_confirmed_at IS NULL;

-- Verify
SELECT 
  'Fixed users' as status,
  u.email,
  u.email_confirmed_at IS NOT NULL as can_login,
  p.name,
  p.phone,
  p.status
FROM auth.users u
JOIN profiles p ON u.id = p.id
WHERE p.status = 'APPROVED'
ORDER BY p.approved_at DESC;
