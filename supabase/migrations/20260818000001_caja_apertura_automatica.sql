ALTER TABLE public.settings ADD COLUMN caja_apertura_automatica BOOLEAN NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';
