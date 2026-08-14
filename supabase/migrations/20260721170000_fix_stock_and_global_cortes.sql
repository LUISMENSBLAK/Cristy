-- Actualizar stock inicial vacío
UPDATE public.products 
SET stock_actual = 0 
WHERE maneja_inventario = true AND stock_actual IS NULL;

-- Evitar que vuelva a ser nulo
ALTER TABLE public.products ALTER COLUMN stock_actual SET DEFAULT 0;

-- Actualizar la policy de cortes_caja para que cualquier empleado logueado pueda ver todos los cortes (ya que ahora se busca globalmente para el siguiente corte)
DROP POLICY IF EXISTS "Authenticated can read cortes" ON public.cortes_caja;
DROP POLICY IF EXISTS "Employee can read own cortes" ON public.cortes_caja;
DROP POLICY IF EXISTS "Authenticated can read own cortes_caja" ON public.cortes_caja;
DROP POLICY IF EXISTS "Caja can read cortes" ON public.cortes_caja;

CREATE POLICY "Authenticated can read all cortes" ON public.cortes_caja FOR SELECT USING (auth.role() = 'authenticated');

-- Sobrescribir función para manejar explícitamente el null como 0
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
      
      -- Obtener stock y nombre
      SELECT nombre, COALESCE(stock_actual, 0) INTO v_nombre, v_stock 
      FROM public.products 
      WHERE id = v_product_id;

      -- Verificar si el stock es nulo o menor a lo solicitado
      IF v_stock < v_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto "%" (Quedan: %, Solicitado: %). Alguien más lo compró antes de que confirmaras el pedido.', v_nombre, v_stock, v_cantidad;
      END IF;

      -- Tratar de descontar (ahora sabemos que hay stock suficiente)
      UPDATE public.products
      SET stock_actual = COALESCE(stock_actual, 0) - v_cantidad
      WHERE id = v_product_id AND maneja_inventario = true AND COALESCE(stock_actual, 0) >= v_cantidad;
      
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
