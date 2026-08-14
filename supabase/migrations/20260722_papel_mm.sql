-- Agregar preferencia de tamaño de papel de impresión
ALTER TABLE public.settings 
  ADD COLUMN IF NOT EXISTS impresora_papel_mm TEXT DEFAULT '80';

NOTIFY pgrst, 'reload schema';
