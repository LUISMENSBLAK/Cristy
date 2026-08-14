ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_impresora_modo_check;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_impresora_modo_check
  CHECK (impresora_modo IN ('red', 'bluetooth', 'usb_qz', 'android_usb', 'android_bluetooth'));
