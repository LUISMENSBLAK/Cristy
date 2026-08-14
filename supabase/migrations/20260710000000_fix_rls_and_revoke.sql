-- Primero, restaurar el permiso general de UPDATE para que el cliente pueda actualizar enviado_a_cocina y campos de cancelación
GRANT UPDATE ON public.order_items TO authenticated;

-- Revocar solo las columnas sensibles que deben pasar exclusivamente por RPC
REVOKE UPDATE (pagado, precio_unitario, cantidad) ON public.order_items FROM authenticated;

-- Función auxiliar que evita la recursión en políticas, usando SECURITY DEFINER para saltar RLS internamente
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

-- Reemplazar la política problemática
DROP POLICY IF EXISTS "Admin full access employees" ON public.employees;
CREATE POLICY "Admin full access employees" ON public.employees FOR ALL USING (public.is_admin());
