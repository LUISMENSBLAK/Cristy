-- Si se llegó a aplicar la columna 'grupo' de un intento anterior, quitarla (ya no aplica)
ALTER TABLE public.categories DROP COLUMN IF EXISTS grupo;

-- Asegurar que existan exactamente las 3 categorías finales (sin duplicar si ya existen)
INSERT INTO public.categories (nombre, orden, activo)
VALUES ('Bebidas', 1, true), ('Comida', 2, true), ('Postres', 3, true)
ON CONFLICT (nombre) DO NOTHING;

-- Permitir que categoria en products sea nula temporalmente para la reasignación
ALTER TABLE public.products ALTER COLUMN categoria DROP NOT NULL;

-- Para cualquier categoría que NO sea una de las 3 finales:
-- desvincular sus productos (quedan sin categoría, para reasignación manual)
UPDATE public.products p
SET categoria_id = NULL, categoria = NULL
FROM public.categories c
WHERE p.categoria_id = c.id
  AND c.nombre NOT IN ('Bebidas', 'Comida', 'Postres');

-- Eliminar las categorías finas, ya no se usan
DELETE FROM public.categories WHERE nombre NOT IN ('Bebidas', 'Comida', 'Postres');
