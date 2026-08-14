-- ============================================================
-- ABAROA POS — Inventario Simple y Cortes de Caja
-- ============================================================

-- 1. Modificar tabla products para inventario
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS maneja_inventario BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_actual INTEGER;

-- 2. Función para regresar stock individual (para cancelaciones)
CREATE OR REPLACE FUNCTION public.regresar_stock(p_product_id UUID, p_cantidad INTEGER)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.products SET stock_actual = stock_actual + p_cantidad
  WHERE id = p_product_id AND maneja_inventario = true;
$$;

-- 3. Función atómica para validar y descontar todo el carrito de golpe
CREATE OR REPLACE FUNCTION public.validar_y_descontar_carrito(
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_product_id UUID;
  v_cantidad INTEGER;
  v_nombre TEXT;
  v_stock INTEGER;
BEGIN
  -- p_items = [{"product_id": "uuid", "cantidad": int}, ...]
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item.value->>'product_id')::UUID;
    v_cantidad := (v_item.value->>'cantidad')::INTEGER;
    
    -- Check if product manages inventory
    IF EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id AND maneja_inventario = true) THEN
      -- Try to deduct
      UPDATE public.products
      SET stock_actual = stock_actual - v_cantidad
      WHERE id = v_product_id AND maneja_inventario = true AND stock_actual >= v_cantidad
      RETURNING nombre INTO v_nombre;
      
      IF NOT FOUND THEN
        -- Rollback and raise descriptive error
        SELECT nombre, stock_actual INTO v_nombre, v_stock FROM public.products WHERE id = v_product_id;
        RAISE EXCEPTION 'Stock insuficiente para el producto "%" (Quedan: %, Solicitado: %). Alguien más lo compró antes de que confirmaras el pedido.', v_nombre, COALESCE(v_stock, 0), v_cantidad;
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Tabla cortes_caja
CREATE TABLE IF NOT EXISTS public.cortes_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES public.employees(id),
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  efectivo_sistema NUMERIC(10,2) NOT NULL,
  efectivo_contado NUMERIC(10,2) NOT NULL,
  diferencia NUMERIC(10,2) NOT NULL,
  tarjeta_sistema NUMERIC(10,2) NOT NULL DEFAULT 0,
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en cortes_caja
ALTER TABLE public.cortes_caja ENABLE ROW LEVEL SECURITY;

-- Evitar duplicidad de policies si se vuelve a correr el archivo
DROP POLICY IF EXISTS "Caja can insert cortes" ON public.cortes_caja;
DROP POLICY IF EXISTS "Admin can read all cortes" ON public.cortes_caja;
DROP POLICY IF EXISTS "Caja can read own cortes" ON public.cortes_caja;

CREATE POLICY "Caja can insert cortes" ON public.cortes_caja FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol IN ('caja','admin'))
);
CREATE POLICY "Admin can read all cortes" ON public.cortes_caja FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);
CREATE POLICY "Caja can read own cortes" ON public.cortes_caja FOR SELECT USING (empleado_id = auth.uid());

NOTIFY pgrst, 'reload schema';
