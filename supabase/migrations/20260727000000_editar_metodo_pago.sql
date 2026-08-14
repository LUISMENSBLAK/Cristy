CREATE OR REPLACE FUNCTION public.editar_metodo_pago(
  p_payment_id UUID,
  p_nuevo_metodo TEXT,
  p_employee_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creado_en TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Solo admin puede editar el método de pago
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND rol = 'admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el método de pago';
  END IF;

  IF p_nuevo_metodo NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;

  SELECT creado_en INTO v_creado_en FROM public.payments WHERE id = p_payment_id AND anulado = false;

  IF v_creado_en IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado o anulado';
  END IF;

  -- Solo se puede editar si el pago fue registrado el mismo día de hoy
  IF v_creado_en::date <> NOW()::date THEN
    RAISE EXCEPTION 'Solo se puede editar el método de pago el mismo día en que se registró';
  END IF;

  UPDATE public.payments SET metodo = p_nuevo_metodo WHERE id = p_payment_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
