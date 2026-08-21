-- Separa USING de WITH CHECK en la política de update del mesero.
-- USING controla qué filas pueden ser actualizadas (solo las que aún no han sido enviadas).
-- WITH CHECK controla el valor nuevo de la fila: solo requiere que el empleado sea un mesero activo.
-- Sin esta separación, PostgreSQL aplica USING también como WITH CHECK, y la fila con
-- enviado_a_cocina=true viola el USING (enviado_a_cocina = false).

DROP POLICY IF EXISTS "Mesero can update order_items" ON public.order_items;

CREATE POLICY "Mesero can update order_items" ON public.order_items
FOR UPDATE
USING (
  (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.rol = 'mesero' AND e.activo = true
  ))
  AND (enviado_a_cocina = false)
)
WITH CHECK (
  (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = auth.uid() AND e.rol = 'mesero' AND e.activo = true
  ))
);
