-- Agregar notas a order_items
ALTER TABLE public.order_items ADD COLUMN notas TEXT;

-- Agregar método de pago a movements
ALTER TABLE public.movements ADD COLUMN metodo TEXT CHECK (metodo IN ('efectivo', 'tarjeta'));

-- Permitir a los empleados con rol 'caja' insertar movimientos
CREATE POLICY "Caja can insert movements" ON public.movements FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'caja'
  )
);
