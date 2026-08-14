CREATE OR REPLACE FUNCTION public.desanular_pago(
  p_payment_id UUID,
  p_employee_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_item_ids UUID[];
  v_anulado BOOLEAN;
  v_creado_en TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND rol = 'admin') THEN
    RAISE EXCEPTION 'Solo admin puede desanular pagos';
  END IF;

  SELECT order_id, item_ids, anulado, creado_en INTO v_order_id, v_item_ids, v_anulado, v_creado_en
  FROM public.payments WHERE id = p_payment_id FOR UPDATE;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  IF NOT v_anulado THEN
    RAISE EXCEPTION 'Este pago no está anulado';
  END IF;

  IF v_creado_en::date <> NOW()::date THEN
    RAISE EXCEPTION 'Solo se puede desanular un pago el mismo día en que se anuló';
  END IF;

  -- Revertir la anulación
  UPDATE public.payments SET anulado = false, motivo_anulacion = NULL WHERE id = p_payment_id;

  -- Volver a marcar esos items como pagados
  UPDATE public.order_items SET pagado = true WHERE id = ANY(v_item_ids);

  -- Si con esto ya no quedan items sin pagar, volver a cerrar el pedido
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = v_order_id AND pagado = false AND cancelado = false
  ) THEN
    UPDATE public.orders SET estado = 'cerrado' WHERE id = v_order_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
