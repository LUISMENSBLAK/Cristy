-- 1. Permitir que Caja también pueda insertar items en la orden
DROP POLICY IF EXISTS "Mesero can insert order_items" ON public.order_items;
CREATE POLICY "Mesero and Caja can insert order_items" ON public.order_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol IN ('mesero', 'caja', 'admin'))
);

-- 2. Permitir que Caja también pueda eliminar items no enviados
DROP POLICY IF EXISTS "Mesero can delete order_items" ON public.order_items;
CREATE POLICY "Mesero and Caja can delete order_items" ON public.order_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol IN ('mesero', 'caja', 'admin'))
);
