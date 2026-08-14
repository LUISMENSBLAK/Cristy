-- Allow every printing channel supported by Abaroa POS.
-- Drops any historical CHECK constraint that references impresora_modo,
-- normalizes unexpected legacy values, and recreates one named constraint.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.settings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%impresora_modo%'
  LOOP
    EXECUTE format('ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
  END LOOP;
END
$$;

UPDATE public.settings
SET impresora_modo = 'red'
WHERE impresora_modo IS NULL
   OR impresora_modo NOT IN ('red', 'bluetooth', 'usb_qz', 'android_usb');

ALTER TABLE public.settings
  ALTER COLUMN impresora_modo SET DEFAULT 'red';

ALTER TABLE public.settings
  ADD CONSTRAINT settings_impresora_modo_check
  CHECK (impresora_modo IN ('red', 'bluetooth', 'usb_qz', 'android_usb'));

NOTIFY pgrst, 'reload schema';
