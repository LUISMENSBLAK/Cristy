-- Prevent duplicate open orders for the same client name under para_llevar/domicilio.
-- If the app tries to create a duplicate, the code in createOrder (orders.ts) catches the
-- 23505 error and falls back to appending to the existing order automatically.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_order_per_cliente
  ON public.orders (tipo, LOWER(TRIM(nombre_cliente)))
  WHERE estado = 'abierto'
    AND tipo IN ('para_llevar', 'domicilio')
    AND nombre_cliente IS NOT NULL
    AND TRIM(nombre_cliente) != '';
