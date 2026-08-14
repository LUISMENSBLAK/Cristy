ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS negocio_nombre TEXT DEFAULT 'Abaroa Cafetería';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS negocio_direccion TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS negocio_telefono TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS negocio_rfc TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ticket_linea_extra TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ticket_logo_url TEXT;
NOTIFY pgrst, 'reload schema';
