-- 1. Asegurar que creado_por exista en order_items (esto resuelve el segundo error)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES public.employees(id);

-- 2. Refrescar la caché de PostgREST para que Supabase reconozca la columna inmediatamente
NOTIFY pgrst, 'reload schema';

-- 3. Arreglar el error de recursión de RLS en employees (usando SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Admin full access employees" ON public.employees;
CREATE POLICY "Admin full access employees" ON public.employees FOR ALL USING (public.is_admin());

-- 4. Permitir que la Caja también pueda insertar órdenes (actualmente solo el Mesero podía)
DROP POLICY IF EXISTS "Mesero can insert orders" ON public.orders;
CREATE POLICY "Mesero and Caja can insert orders" ON public.orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol IN ('mesero', 'caja', 'admin'))
);

-- 5. Restaurar permisos de UPDATE requeridos para el frontend y proteger solo columnas críticas
GRANT UPDATE ON public.order_items TO authenticated;
REVOKE UPDATE (pagado, precio_unitario, cantidad) ON public.order_items FROM authenticated;
