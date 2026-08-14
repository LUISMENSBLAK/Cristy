-- Modificar archivar_mes para validar que el mes ya haya terminado
CREATE OR REPLACE FUNCTION public.archivar_mes(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orders_count   INTEGER;
  v_payments_count INTEGER;
  v_movs_count     INTEGER;
BEGIN
  -- Verificar permisos
  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo admin puede archivar meses';
  END IF;

  -- Bloquear archivado de meses no terminados
  IF p_end >= now() THEN
    RAISE EXCEPTION 'No se puede archivar un mes que aún no ha terminado';
  END IF;

  -- Archivar órdenes cerradas en el período
  UPDATE public.orders
    SET archivado = true
    WHERE creado_en >= p_start
      AND creado_en <= p_end
      AND archivado = false;
  GET DIAGNOSTICS v_orders_count = ROW_COUNT;

  -- Archivar pagos en el período
  UPDATE public.payments
    SET archivado = true
    WHERE creado_en >= p_start
      AND creado_en <= p_end
      AND archivado = false;
  GET DIAGNOSTICS v_payments_count = ROW_COUNT;

  -- Archivar movimientos en el período
  UPDATE public.movements
    SET archivado = true
    WHERE fecha >= p_start
      AND fecha <= p_end
      AND archivado = false;
  GET DIAGNOSTICS v_movs_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'orders', v_orders_count,
    'order_items', 0, -- Por compatibilidad con versión anterior
    'payments', v_payments_count,
    'movements', v_movs_count
  );
END;
$$;

-- Crear función para desarchivar un mes
CREATE OR REPLACE FUNCTION public.desarchivar_mes(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orders_count   INTEGER;
  v_payments_count INTEGER;
  v_movs_count     INTEGER;
BEGIN
  -- Verificar permisos
  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo admin puede desarchivar meses';
  END IF;

  -- Desarchivar órdenes en el período
  UPDATE public.orders
    SET archivado = false
    WHERE creado_en >= p_start
      AND creado_en <= p_end
      AND archivado = true;
  GET DIAGNOSTICS v_orders_count = ROW_COUNT;

  -- Desarchivar pagos en el período
  UPDATE public.payments
    SET archivado = false
    WHERE creado_en >= p_start
      AND creado_en <= p_end
      AND archivado = true;
  GET DIAGNOSTICS v_payments_count = ROW_COUNT;

  -- Desarchivar movimientos en el período
  UPDATE public.movements
    SET archivado = false
    WHERE fecha >= p_start
      AND fecha <= p_end
      AND archivado = true;
  GET DIAGNOSTICS v_movs_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'orders', v_orders_count,
    'order_items', 0,
    'payments', v_payments_count,
    'movements', v_movs_count
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
