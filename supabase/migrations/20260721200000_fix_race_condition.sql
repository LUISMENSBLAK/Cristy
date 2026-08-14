-- ============================================================
-- ABAROA POS — Fix Race Condition (Multiple Open Orders per Table)
-- ============================================================

-- 1. Create the reusable RPC to merge duplicate open orders for a table
CREATE OR REPLACE FUNCTION public.fusionar_pedidos_duplicados_mesa(p_table_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_oldest_order_id UUID;
  v_duplicate_ids UUID[];
BEGIN
  -- Validate we have at least 2 open orders for this table
  IF (SELECT COUNT(*) FROM public.orders WHERE table_id = p_table_id AND estado = 'abierto' AND tipo = 'mesa') < 2 THEN
    RETURN;
  END IF;

  -- Find the oldest open order (the primary one)
  SELECT id INTO v_oldest_order_id
  FROM public.orders
  WHERE table_id = p_table_id AND estado = 'abierto' AND tipo = 'mesa'
  ORDER BY creado_en ASC
  LIMIT 1;

  -- Collect the IDs of all other (newer) open orders for this table
  SELECT array_agg(id) INTO v_duplicate_ids
  FROM public.orders
  WHERE table_id = p_table_id AND estado = 'abierto' AND tipo = 'mesa' AND id != v_oldest_order_id;

  IF array_length(v_duplicate_ids, 1) > 0 THEN
    -- Move all order_items from the duplicates to the primary oldest order
    UPDATE public.order_items
    SET order_id = v_oldest_order_id
    WHERE order_id = ANY(v_duplicate_ids);

    -- Mark the duplicate orders as 'cancelado' (so they disappear from Activos but remain in history)
    UPDATE public.orders
    SET estado = 'cancelado',
        notas = concat(COALESCE(notas, ''), ' [Auto-cancelado: Fusionado con orden ', v_oldest_order_id, ']')
    WHERE id = ANY(v_duplicate_ids);
  END IF;
END;
$$;

-- 2. Run the cleanup logic on existing data using the RPC we just created
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Loop through all tables that currently have > 1 open order
  FOR rec IN (
    SELECT table_id
    FROM public.orders
    WHERE estado = 'abierto' AND tipo = 'mesa' AND table_id IS NOT NULL
    GROUP BY table_id
    HAVING COUNT(*) > 1
  ) LOOP
    PERFORM public.fusionar_pedidos_duplicados_mesa(rec.table_id);
  END LOOP;
END $$;

-- 3. Create a unique partial index to prevent future race conditions
-- This ensures the DB rejects a second insert for the same table_id if there's already one 'abierto'
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_order_per_table
ON public.orders (table_id)
WHERE estado = 'abierto' AND tipo = 'mesa' AND table_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
