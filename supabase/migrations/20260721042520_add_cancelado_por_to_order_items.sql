-- Agregar columna cancelado_por a order_items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES public.employees(id);

CREATE INDEX IF NOT EXISTS idx_order_items_cancelado_por ON public.order_items(cancelado_por);

NOTIFY pgrst, 'reload schema';
