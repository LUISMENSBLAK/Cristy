-- Impresora de cocina
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS impresora_cocina_activa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS impresora_cocina_modo TEXT DEFAULT 'red'
    CHECK (impresora_cocina_modo IN ('red','bluetooth','usb_qz','android_usb','android_bluetooth')),
  ADD COLUMN IF NOT EXISTS impresora_cocina_ip TEXT,
  ADD COLUMN IF NOT EXISTS impresora_cocina_qz_nombre TEXT;

-- Nombre del negocio
UPDATE public.settings SET negocio_nombre = 'Cristi''s Coffe & Snack' WHERE id = 1;
