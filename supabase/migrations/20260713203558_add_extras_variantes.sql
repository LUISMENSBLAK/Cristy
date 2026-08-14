-- 1. Añadir flag de variante única a product_extras
ALTER TABLE public.product_extras
  ADD COLUMN IF NOT EXISTS es_variante_unica BOOLEAN NOT NULL DEFAULT false;

-- 2. Columna variante_id en order_items (una sola variante por ítem, gratuita)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variante_id UUID REFERENCES public.product_extras(id) ON DELETE SET NULL;

-- Snapshot del nombre de la variante al momento de pedir
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS nombre_variante TEXT;

-- 3. Tabla intermedia para extras de pago (múltiples por ítem)
CREATE TABLE IF NOT EXISTS public.order_item_extras (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  extra_id     UUID NOT NULL REFERENCES public.product_extras(id) ON DELETE CASCADE,
  nombre_extra TEXT NOT NULL,
  precio_adicional NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(order_item_id, extra_id)
);

-- RLS para order_item_extras (allow all authenticated, igual que order_items)
ALTER TABLE public.order_item_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_authenticated_all_order_item_extras"
  ON public.order_item_extras
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Forzar recarga del caché de esquema de PostgREST
NOTIFY pgrst, 'reload schema';
