-- ============================================================
-- ABAROA POS — Archivado de meses + Settings QZ Tray
-- ============================================================

-- 1. Columna nombre_impresora_windows en settings (para QZ Tray USB)
ALTER TABLE public.settings 
  ADD COLUMN IF NOT EXISTS nombre_impresora_windows TEXT;

-- 2. Columna archivado en orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT false;

-- 3. Columna archivado en payments  
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT false;

-- 4. Columna archivado en movements
ALTER TABLE public.movements 
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT false;

-- 5. Índices para rendimiento en filtros de archivado
CREATE INDEX IF NOT EXISTS idx_orders_archivado    ON public.orders(archivado);
CREATE INDEX IF NOT EXISTS idx_payments_archivado  ON public.payments(archivado);
CREATE INDEX IF NOT EXISTS idx_movements_archivado ON public.movements(archivado);

-- 6. RPC: archivar_mes
-- Marca como archivado=true todos los registros de orders, payments y movements
-- dentro del rango de fechas indicado. Solo admin puede ejecutarlo.
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
    'orders',   v_orders_count,
    'payments', v_payments_count,
    'movements', v_movs_count
  );
END;
$$;

-- 7. RPC: borrar_mes_permanente
-- Borra DEFINITIVAMENTE todos los registros de un mes que ya fue archivado.
-- Requiere que el mes esté archivado primero (protección extra).
-- Solo admin puede ejecutarlo.
CREATE OR REPLACE FUNCTION public.borrar_mes_permanente(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_ids      UUID[];
  v_orders_count   INTEGER;
  v_items_count    INTEGER;
  v_payments_count INTEGER;
  v_movs_count     INTEGER;
BEGIN
  -- Verificar permisos
  IF NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo admin puede borrar meses permanentemente';
  END IF;

  -- Verificar que hay registros archivados en ese período
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE creado_en >= p_start AND creado_en <= p_end AND archivado = true
    LIMIT 1
  ) AND NOT EXISTS (
    SELECT 1 FROM public.payments
    WHERE creado_en >= p_start AND creado_en <= p_end AND archivado = true
    LIMIT 1
  ) AND NOT EXISTS (
    SELECT 1 FROM public.movements
    WHERE fecha >= p_start AND fecha <= p_end AND archivado = true
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'No hay registros archivados en ese período. Archiva el mes primero antes de borrarlo.';
  END IF;

  -- Recopilar IDs de órdenes archivadas del período
  SELECT ARRAY_AGG(id) INTO v_order_ids
  FROM public.orders
  WHERE creado_en >= p_start
    AND creado_en <= p_end
    AND archivado = true;

  -- Borrar order_items de esas órdenes
  IF v_order_ids IS NOT NULL THEN
    DELETE FROM public.order_items
    WHERE order_id = ANY(v_order_ids);
    GET DIAGNOSTICS v_items_count = ROW_COUNT;

    -- Borrar orders archivadas
    DELETE FROM public.orders
    WHERE id = ANY(v_order_ids);
    GET DIAGNOSTICS v_orders_count = ROW_COUNT;
  ELSE
    v_items_count  := 0;
    v_orders_count := 0;
  END IF;

  -- Borrar payments archivados del período
  DELETE FROM public.payments
  WHERE creado_en >= p_start
    AND creado_en <= p_end
    AND archivado = true;
  GET DIAGNOSTICS v_payments_count = ROW_COUNT;

  -- Borrar movimientos archivados del período
  DELETE FROM public.movements
  WHERE fecha >= p_start
    AND fecha <= p_end
    AND archivado = true;
  GET DIAGNOSTICS v_movs_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'orders',      v_orders_count,
    'order_items', v_items_count,
    'payments',    v_payments_count,
    'movements',   v_movs_count
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
