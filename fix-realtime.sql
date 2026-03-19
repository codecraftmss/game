-- ============================================================
-- FIX: Enable Supabase Realtime on required tables
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Enable Realtime on game_state (admin changes → betting room)
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;

-- 2. Enable Realtime on rooms (admin room status changes → lobby)
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;

-- 3. Enable Realtime on profiles (balance updates → betting room)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- 4. Enable Realtime on bets (optional: for future bet tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE public.bets;

-- ============================================================
-- VERIFY: Check which tables have realtime enabled
-- ============================================================
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================================
-- ALSO: Make sure the game_state RLS SELECT policy allows all
-- authenticated users to read (required for realtime to work)
-- ============================================================
DROP POLICY IF EXISTS "game_state_select_all" ON public.game_state;
CREATE POLICY "game_state_select_all" ON public.game_state
  FOR SELECT USING (auth.role() = 'authenticated');

-- Done! ✅
-- After running this, real-time updates will work automatically
-- without needing a page refresh.
