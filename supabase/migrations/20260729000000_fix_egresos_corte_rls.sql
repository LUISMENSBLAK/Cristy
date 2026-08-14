CREATE OR REPLACE FUNCTION public.obtener_egresos_efectivo(p_desde TIMESTAMP WITH TIME ZONE)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(monto), 0)
  FROM public.movements
  WHERE tipo = 'egreso' AND metodo = 'efectivo' AND fecha >= p_desde;
$$;

NOTIFY pgrst, 'reload schema';
