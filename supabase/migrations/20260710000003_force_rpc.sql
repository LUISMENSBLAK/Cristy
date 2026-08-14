-- 1. RPC: Marcar Item Listo
CREATE OR REPLACE FUNCTION public.marcar_item_listo(p_item_id UUID, p_listo BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'cocina') THEN
    RAISE EXCEPTION 'Solo cocina puede marcar items como listos';
  END IF;
  UPDATE public.order_items SET listo = p_listo WHERE id = p_item_id;
END;
$$;

-- 2. RPC: Procesar Pago (Atómico)
CREATE OR REPLACE FUNCTION public.procesar_pago(
  p_order_id UUID,
  p_table_id UUID,
  p_item_ids UUID[],
  p_metodo TEXT,
  p_monto_recibido NUMERIC,
  p_monto_cobrado NUMERIC,
  p_cambio NUMERIC
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

  -- Insert payment
  INSERT INTO public.payments (order_id, metodo, monto_recibido, monto_cobrado, cambio, item_ids)
  VALUES (p_order_id, p_metodo, p_monto_recibido, p_monto_cobrado, p_cambio, p_item_ids);

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

-- 3. RPC: Anular Pago
CREATE OR REPLACE FUNCTION public.anular_pago(
  p_payment_id UUID,
  p_motivo TEXT
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
  -- Verify permissions
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'admin') THEN
    RAISE EXCEPTION 'Solo admin puede anular pagos';
  END IF;

  SELECT order_id, item_ids, anulado INTO v_order_id, v_item_ids, v_already_annulled
  FROM public.payments WHERE id = p_payment_id FOR UPDATE;

  IF v_already_annulled THEN
    RAISE EXCEPTION 'El pago ya estaba anulado';
  END IF;

  -- Annul the payment
  UPDATE public.payments SET anulado = true, motivo_anulacion = p_motivo WHERE id = p_payment_id;

  -- Mark items as unpaid
  UPDATE public.order_items SET pagado = false WHERE id = ANY(v_item_ids);

  -- Reopen order and occupy table
  UPDATE public.orders SET estado = 'abierto' WHERE id = v_order_id;
  SELECT table_id INTO v_table_id FROM public.orders WHERE id = v_order_id;
  IF v_table_id IS NOT NULL THEN
    UPDATE public.tables SET estado = 'ocupada' WHERE id = v_table_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
