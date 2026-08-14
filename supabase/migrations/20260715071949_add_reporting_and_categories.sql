-- 1. Add metas to settings
ALTER TABLE public.settings ADD COLUMN meta_diaria DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN meta_semanal DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN meta_mensual DECIMAL(10, 2) DEFAULT 0;

-- 2. product_price_history
CREATE TABLE public.product_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    precio_anterior DECIMAL(10, 2) NOT NULL,
    precio_nuevo DECIMAL(10, 2) NOT NULL,
    cambiado_por UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. notas_diarias
CREATE TABLE public.notas_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL UNIQUE,
    contenido TEXT NOT NULL,
    creado_por UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. categories and migration
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Migración inteligente de categorías existentes
-- Usamos INITCAP y TRIM para unificar ("Bebidas", "bebidas ", " BEBIDAS" -> "Bebidas")
INSERT INTO public.categories (nombre, orden)
SELECT DISTINCT INITCAP(TRIM(categoria)), 0
FROM public.products
WHERE categoria IS NOT NULL AND TRIM(categoria) != ''
ON CONFLICT (nombre) DO NOTHING;

-- Agregar FK a products
ALTER TABLE public.products ADD COLUMN categoria_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- Asignar los categoria_id correctos basados en la limpieza
UPDATE public.products p
SET categoria_id = c.id
FROM public.categories c
WHERE INITCAP(TRIM(p.categoria)) = c.nombre;
