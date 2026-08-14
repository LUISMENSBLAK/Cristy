-- Agregar columna creado_en a order_items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Backfill creado_en con el creado_en de la orden a la que pertenecen
UPDATE public.order_items oi
SET creado_en = o.creado_en
FROM public.orders o
WHERE oi.order_id = o.id AND oi.creado_en IS NULL;

-- Asegurarnos de que no sea nulo en el futuro
ALTER TABLE public.order_items ALTER COLUMN creado_en SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_creado_en ON public.order_items(creado_en);

NOTIFY pgrst, 'reload schema';
