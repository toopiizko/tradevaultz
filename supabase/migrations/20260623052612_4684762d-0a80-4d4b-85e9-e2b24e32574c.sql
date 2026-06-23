ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS slip_hash text;
CREATE INDEX IF NOT EXISTS expenses_user_slip_hash_idx ON public.expenses(user_id, slip_hash) WHERE slip_hash IS NOT NULL;