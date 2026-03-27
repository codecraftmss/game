-- Fix admin deletion constraint in token_transactions
-- The current constraint restricts deletion if an admin has performed transactions

ALTER TABLE public.token_transactions 
DROP CONSTRAINT IF EXISTS token_transactions_admin_id_fkey;

ALTER TABLE public.token_transactions
ADD CONSTRAINT token_transactions_admin_id_fkey 
FOREIGN KEY (admin_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- Also verify admin_actions (from migration 20260210121614)
-- It already has ON DELETE SET NULL, but we re-apply for safety
ALTER TABLE public.admin_actions
DROP CONSTRAINT IF EXISTS admin_actions_admin_id_fkey;

ALTER TABLE public.admin_actions
ADD CONSTRAINT admin_actions_admin_id_fkey
FOREIGN KEY (admin_id)
REFERENCES auth.users(id)
ON DELETE SET NULL;
