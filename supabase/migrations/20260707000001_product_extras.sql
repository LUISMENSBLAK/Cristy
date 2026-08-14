-- Migration to add Product Extras

CREATE TABLE public.product_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  precio_adicional NUMERIC(10,2) NOT NULL,
  categoria_aplicable TEXT, -- if null, might apply to specific product
  producto_id UUID REFERENCES public.products(id) ON DELETE CASCADE, -- Option (b): specific product
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure it applies to either a category or a specific product
  CONSTRAINT chk_aplicable CHECK (categoria_aplicable IS NOT NULL OR producto_id IS NOT NULL)
);

ALTER TABLE public.product_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read product_extras" ON public.product_extras FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can modify product_extras" ON public.product_extras FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);

-- Modify order_items to support extras
ALTER TABLE public.order_items ADD COLUMN extra_id UUID REFERENCES public.product_extras(id);
ALTER TABLE public.order_items ADD COLUMN extra_precio NUMERIC(10,2);

-- Add description to products
ALTER TABLE public.products ADD COLUMN descripcion TEXT;
