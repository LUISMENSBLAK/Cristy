-- 1. Agregar columna faltante a la tabla payments
ALTER TABLE public.payments
ADD COLUMN cobrado_por UUID REFERENCES public.employees(id);

CREATE INDEX IF NOT EXISTS idx_payments_cobrado_por ON public.payments(cobrado_por);

-- 2. Modificar el RPC procesar_pago para incluir el parámetro y guardar cobrado_por
CREATE OR REPLACE FUNCTION public.procesar_pago(
  p_order_id UUID,
  p_table_id UUID,
  p_item_ids UUID[],
  p_metodo TEXT,
  p_monto_recibido NUMERIC,
  p_monto_cobrado NUMERIC,
  p_cambio NUMERIC,
  p_employee_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invalid_count INTEGER;
  v_remaining_unpaid INTEGER;
BEGIN
  -- Verify permissions
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'caja') THEN
    RAISE EXCEPTION 'Solo caja puede procesar pagos';
  END IF;

  -- Lock items first
  PERFORM 1
  FROM public.order_items
  WHERE id = ANY(p_item_ids)
  FOR UPDATE;

  -- Verify items
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.order_items
  WHERE id = ANY(p_item_ids) AND (pagado = true OR cancelado = true);

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Uno o más productos ya fueron cobrados o cancelados, actualiza la pantalla';
  END IF;

  -- Insert payment con cobrado_por
  INSERT INTO public.payments (order_id, metodo, monto_recibido, monto_cobrado, cambio, item_ids, cobrado_por)
  VALUES (p_order_id, p_metodo, p_monto_recibido, p_monto_cobrado, p_cambio, p_item_ids, p_employee_id);

  -- Mark items as paid
  UPDATE public.order_items SET pagado = true WHERE id = ANY(p_item_ids);

  -- Check remaining unpaid items
  SELECT COUNT(*) INTO v_remaining_unpaid
  FROM public.order_items
  WHERE order_id = p_order_id AND pagado = false AND cancelado = false;

  -- Close order if fully paid
  IF v_remaining_unpaid = 0 THEN
    UPDATE public.orders SET estado = 'cerrado' WHERE id = p_order_id;
    IF p_table_id IS NOT NULL THEN
      UPDATE public.tables SET estado = 'libre' WHERE id = p_table_id;
    END IF;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
