ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS grupo TEXT CHECK (grupo IN ('bebidas', 'comida', 'postres'));
