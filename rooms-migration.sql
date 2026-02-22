-- ============================================================
-- ROOMS TABLE MIGRATION (Fixed — uses user_roles table)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  label        text NOT NULL DEFAULT '',
  min_bet      numeric NOT NULL DEFAULT 500,
  max_bet      numeric NOT NULL DEFAULT 50000,
  status       text NOT NULL DEFAULT 'OFFLINE'
                 CHECK (status IN ('ONLINE','OFFLINE','LIVE','MAINTENANCE')),
  image_url    text,
  open_time    text DEFAULT '11:00 AM',
  close_time   text DEFAULT '10:00 PM',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed default rooms
INSERT INTO public.rooms (name, label, min_bet, max_bet, status, image_url, open_time, close_time)
VALUES
  ('High Stakes',   'ROOM 01', 500,  50000, 'ONLINE',  'https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80', '11:00 AM', '10:00 PM'),
  ('Royal Flush',   'ROOM 02', 1000, 50000, 'ONLINE',  'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=400&q=80', '11:00 AM', '10:00 PM'),
  ('Privé Lounge',  'ROOM 03', 2000, 50000, 'OFFLINE', NULL, '11:00 AM', '10:00 PM'),
  ('Practice Deck', 'ROOM 04', 500,  10000, 'OFFLINE', NULL, '11:00 AM', '10:00 PM')
ON CONFLICT DO NOTHING;

-- 3. Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if re-running
DROP POLICY IF EXISTS "rooms_select_users"  ON public.rooms;
DROP POLICY IF EXISTS "rooms_select_admin"  ON public.rooms;
DROP POLICY IF EXISTS "rooms_update_admin"  ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert_admin"  ON public.rooms;

-- 5. SELECT policy:
--    - Admins (have role='admin' in user_roles) can see ALL rooms
--    - Regular users can only see ONLINE or LIVE rooms
CREATE POLICY "rooms_select_users" ON public.rooms
  FOR SELECT
  USING (
    status IN ('ONLINE', 'LIVE')
    OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- 6. UPDATE policy: only admins can update rooms
CREATE POLICY "rooms_update_admin" ON public.rooms
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- 7. INSERT policy: only admins can insert rooms
CREATE POLICY "rooms_insert_admin" ON public.rooms
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- 8. Enable Realtime for rooms table
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

-- Done! ✅
-- Verify with:
-- SELECT * FROM public.rooms;
