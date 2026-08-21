CREATE OR REPLACE FUNCTION public.editar_metodo_pago(
  p_payment_id UUID,
  p_nuevo_metodo TEXT,
  p_employee_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creado_en TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND rol = 'admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el método de pago';
  END IF;
  IF p_nuevo_metodo NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  SELECT creado_en INTO v_creado_en FROM public.payments WHERE id = p_payment_id AND anulado = false;
  IF v_creado_en IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado o anulado';
  END IF;
  IF v_creado_en::date <> NOW()::date THEN
    RAISE EXCEPTION 'Solo se puede editar el método de pago el mismo día en que se registró';
  END IF;
  UPDATE public.payments SET metodo = p_nuevo_metodo WHERE id = p_payment_id;
END;
$$;

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
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Pago no encontrado'; END IF;
  IF NOT v_anulado THEN RAISE EXCEPTION 'El pago no está anulado'; END IF;
  IF DATE(v_creado_en AT TIME ZONE 'UTC') != DATE(now() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Solo se pueden desanular pagos del mismo día';
  END IF;
  UPDATE public.payments SET anulado = false, motivo_anulacion = null WHERE id = p_payment_id;
  UPDATE public.order_items SET pagado = true WHERE id = ANY(v_item_ids);
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = v_order_id AND pagado = false AND cancelado = false) THEN
    UPDATE public.orders SET estado = 'cerrado' WHERE id = v_order_id;
    UPDATE public.tables SET estado = 'disponible' WHERE id = (SELECT table_id FROM public.orders WHERE id = v_order_id);
  END IF;
END;
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unidades_por_carton INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unidades_por_carton_check;
ALTER TABLE public.products ADD CONSTRAINT products_unidades_por_carton_check
  CHECK (unidades_por_carton > 0);

NOTIFY pgrst, 'reload schema';
