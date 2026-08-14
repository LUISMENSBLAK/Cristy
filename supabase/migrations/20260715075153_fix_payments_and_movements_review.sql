-- 1. Ensure 'anulado' and 'motivo_anulacion' exist in payments (User reported them missing in prod)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS anulado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

-- 2. Add 'revisado_por_admin' to movements to track manual expenses
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS revisado_por_admin BOOLEAN DEFAULT true; -- Defaults to true for old ones
