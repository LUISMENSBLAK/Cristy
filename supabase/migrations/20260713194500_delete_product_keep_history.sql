-- Guardar el nombre del producto como texto en cada item de pedido
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS nombre_producto TEXT;

-- Rellenar los registros existentes con el nombre actual de cada producto
UPDATE public.order_items oi
SET nombre_producto = p.nombre
FROM public.products p
WHERE oi.product_id = p.id AND oi.nombre_producto IS NULL;

-- Permitir que product_id quede vacío cuando el producto se borre
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;

-- Cambiar la relación: al borrar un producto, ya no bloquear, solo desvincular
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;