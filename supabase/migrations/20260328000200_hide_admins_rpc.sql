-- RPC to get only player profiles (excluding admins)
CREATE OR REPLACE FUNCTION public.get_player_profiles()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles
  WHERE id NOT IN (
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  )
  ORDER BY created_at DESC;
$$;
