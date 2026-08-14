CREATE OR REPLACE FUNCTION public.anular_pago(
  p_payment_id UUID,
  p_motivo TEXT,
  p_employee_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_table_id UUID;
  v_item_ids UUID[];
  v_already_annulled BOOLEAN;
BEGIN
  -- Verify permissions usando el employee_id explícito, no auth.uid()
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND rol = 'admin') THEN
    RAISE EXCEPTION 'Solo admin puede anular pagos';
  END IF;

  SELECT order_id, item_ids, anulado INTO v_order_id, v_item_ids, v_already_annulled
  FROM public.payments WHERE id = p_payment_id FOR UPDATE;

  IF v_already_annulled THEN
    RAISE EXCEPTION 'El pago ya estaba anulado';
  END IF;

  UPDATE public.payments SET anulado = true, motivo_anulacion = p_motivo WHERE id = p_payment_id;
  UPDATE public.order_items SET pagado = false WHERE id = ANY(v_item_ids);
  UPDATE public.orders SET estado = 'abierto' WHERE id = v_order_id;
  SELECT table_id INTO v_table_id FROM public.orders WHERE id = v_order_id;
  IF v_table_id IS NOT NULL THEN
    UPDATE public.tables SET estado = 'ocupada' WHERE id = v_table_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
