-- ============================================================
-- GAME STATE MIGRATION
-- Run this in Supabase SQL Editor AFTER rooms-migration.sql
-- ============================================================

-- 1. Create game_state table (one row per room, upserted)
CREATE TABLE IF NOT EXISTS public.game_state (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE UNIQUE,
  betting_phase    text NOT NULL DEFAULT '1ST_BET'
                     CHECK (betting_phase IN ('1ST_BET', '2ND_BET')),
  betting_status   text NOT NULL DEFAULT 'CLOSED'
                     CHECK (betting_status IN ('OPEN', 'CLOSED')),
  timer_seconds    integer NOT NULL DEFAULT 30,
  current_round    integer NOT NULL DEFAULT 1,
  result           text CHECK (result IN ('ANDAR', 'BAHAR')),
  target_card      text,          -- e.g. "A♥", "K♠"
  is_live          boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed one game_state row per existing room
INSERT INTO public.game_state (room_id)
SELECT id FROM public.rooms
ON CONFLICT (room_id) DO NOTHING;

-- 3. Create game_history table
CREATE TABLE IF NOT EXISTS public.game_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  result       text CHECK (result IN ('ANDAR', 'BAHAR')),
  target_card  text,
  total_payout numeric DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.game_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies
DROP POLICY IF EXISTS "game_state_select_all"   ON public.game_state;
DROP POLICY IF EXISTS "game_state_update_admin" ON public.game_state;
DROP POLICY IF EXISTS "game_history_select_all" ON public.game_history;
DROP POLICY IF EXISTS "game_history_insert_admin" ON public.game_history;

-- 6. game_state: authenticated users can read, only admin can write
CREATE POLICY "game_state_select_all" ON public.game_state
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "game_state_update_admin" ON public.game_state
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "game_state_insert_admin" ON public.game_state
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- 7. game_history: all authenticated users can read, only admin inserts
CREATE POLICY "game_history_select_all" ON public.game_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "game_history_insert_admin" ON public.game_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- 8. Enable Realtime on both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_history;

-- Done! ✅
-- Verify:
-- SELECT gs.*, r.name FROM game_state gs JOIN rooms r ON r.id = gs.room_id;
