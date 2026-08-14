-- Migration for Turnos and Product Ingredients

ALTER TABLE public.products ADD COLUMN turno TEXT NOT NULL DEFAULT 'todo_dia' CHECK (turno IN ('manana', 'tarde', 'todo_dia'));
ALTER TABLE public.products ADD COLUMN ingredientes_incluidos INTEGER;
ALTER TABLE public.products ADD COLUMN precio_ingrediente_extra NUMERIC(10,2);

CREATE TABLE public.product_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  activo BOOLEAN DEFAULT true
);

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read product_ingredients" ON public.product_ingredients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can modify product_ingredients" ON public.product_ingredients FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);

ALTER TABLE public.order_items ADD COLUMN ingredientes_seleccionados JSONB;
ALTER TABLE public.order_items ADD COLUMN cargo_ingredientes_extra NUMERIC(10,2) DEFAULT 0;
