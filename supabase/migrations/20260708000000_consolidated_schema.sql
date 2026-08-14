-- ============================================================
-- ABAROA POS — Consolidated Schema Additions & Refinements
-- ============================================================

-- 1. Realtime configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

-- 2. Settings table
CREATE TABLE IF NOT EXISTS public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  impresora_activa BOOLEAN NOT NULL DEFAULT false,
  impresora_modo TEXT NOT NULL CHECK (impresora_modo IN ('red', 'bluetooth')) DEFAULT 'red',
  impresora_ip TEXT
);
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'Authenticated can read settings') THEN
    CREATE POLICY "Authenticated can read settings" ON public.settings FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'settings' AND policyname = 'Admin can update settings') THEN
    CREATE POLICY "Admin can update settings" ON public.settings FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
    );
  END IF;
END $$;

-- 3. Additional Columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'enviado_a_cocina') THEN
    ALTER TABLE public.order_items ADD COLUMN enviado_a_cocina BOOLEAN NOT NULL DEFAULT false;
    UPDATE public.order_items oi SET enviado_a_cocina = o.enviado_a_cocina FROM public.orders o WHERE oi.order_id = o.id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'creado_por') THEN
    ALTER TABLE public.order_items ADD COLUMN creado_por UUID REFERENCES public.employees(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'anulado') THEN
    ALTER TABLE public.payments ADD COLUMN anulado BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'motivo_anulacion') THEN
    ALTER TABLE public.payments ADD COLUMN motivo_anulacion TEXT;
  END IF;
END $$;

-- 4. Clean up old column
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'enviado_a_cocina') THEN
    ALTER TABLE public.orders DROP COLUMN enviado_a_cocina;
  END IF;
END $$;

-- 5. Policies for Caja
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Caja can insert orders') THEN
    CREATE POLICY "Caja can insert orders" ON public.orders FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'caja'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'Caja can insert order_items') THEN
    CREATE POLICY "Caja can insert order_items" ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'caja'));
  END IF;
END $$;

-- Refine order_items UPDATE policies
DROP POLICY IF EXISTS "Authenticated can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Cocina can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Mesero can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Caja can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admin can update order_items" ON public.order_items;

CREATE POLICY "Cocina can update order_items" ON public.order_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'cocina')
);
CREATE POLICY "Mesero can update order_items" ON public.order_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'mesero') AND enviado_a_cocina = false
);
CREATE POLICY "Caja can update order_items" ON public.order_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'caja')
);
CREATE POLICY "Admin can update order_items" ON public.order_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);

-- 6. RPC: Marcar Item Listo
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

-- 7. RPC: Procesar Pago (Atómico)
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

  -- Lock and verify items
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.order_items
  WHERE id = ANY(p_item_ids) AND (pagado = true OR cancelado = true)
  FOR UPDATE;

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

-- 8. RPC: Anular Pago
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

-- 9. Revocar UPDATE directo sobre columnas sensibles en order_items
-- By default, authenticated users have UPDATE on all columns because of GRANT ALL ON TABLE.
-- We revoke UPDATE entirely and then grant it only on allowed columns.
REVOKE UPDATE ON public.order_items FROM authenticated;
GRANT UPDATE (cantidad, ingredientes_seleccionados, extra_id, extra_precio, cargo_ingredientes_extra, enviado_a_cocina, motivo_cancelacion, cancelado, cancelado_en) ON public.order_items TO authenticated;
