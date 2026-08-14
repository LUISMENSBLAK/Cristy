ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_minimo INTEGER NOT NULL DEFAULT 5;

NOTIFY pgrst, 'reload schema';
