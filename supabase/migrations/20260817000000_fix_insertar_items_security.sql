-- Fix: Agrega SECURITY DEFINER a insertar_items_pedido para evadir errores de RLS de order_items
-- por desincronización de auth.uid() en la sesión cliente.
-- Se valida manualmente la autorización (rol y estado activo del empleado).

CREATE OR REPLACE FUNCTION public.insertar_items_pedido(
  p_order_id    UUID,
  p_items       JSONB,
  p_employee_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        JSONB;
  v_extra       JSONB;
  v_item_id     UUID;
  v_rol         TEXT;
BEGIN
  -- Validación explícita de rol, ya que SECURITY DEFINER se salta el RLS normal:
  -- verificamos manualmente que el empleado exista, esté activo, y tenga un rol autorizado.
  SELECT rol INTO v_rol FROM public.employees WHERE id = p_employee_id AND activo = true;

  IF v_rol IS NULL OR v_rol NOT IN ('mesero', 'caja', 'admin') THEN
    RAISE EXCEPTION 'Empleado no autorizado para crear productos en el pedido';
  END IF;

  -- Iterar sobre cada item del carrito
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Insertar el order_item y capturar su ID recién generado
    INSERT INTO public.order_items (
      order_id,
      product_id,
      cantidad,
      precio_unitario,
      nombre_producto,
      extra_id,
      extra_precio,
      variante_id,
      nombre_variante,
      ingredientes_seleccionados,
      cargo_ingredientes_extra,
      notas,
      enviado_a_cocina,
      creado_por,
      pagado,
      cancelado
    )
    VALUES (
      p_order_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'cantidad')::INTEGER,
      (v_item->>'precio_unitario')::NUMERIC,
      v_item->>'nombre_producto',
      CASE WHEN v_item->>'extra_id' IS NOT NULL AND v_item->>'extra_id' != 'null'
           THEN (v_item->>'extra_id')::UUID ELSE NULL END,
      CASE WHEN v_item->>'extra_precio' IS NOT NULL AND v_item->>'extra_precio' != 'null'
           THEN (v_item->>'extra_precio')::NUMERIC ELSE NULL END,
      CASE WHEN v_item->>'variante_id' IS NOT NULL AND v_item->>'variante_id' != 'null'
           THEN (v_item->>'variante_id')::UUID ELSE NULL END,
      v_item->>'nombre_variante',
      CASE WHEN v_item->'ingredientes_seleccionados' IS NOT NULL AND v_item->'ingredientes_seleccionados' != 'null'
           THEN v_item->'ingredientes_seleccionados' ELSE NULL END,
      COALESCE((v_item->>'cargo_ingredientes_extra')::NUMERIC, 0),
      v_item->>'notas',
      false,
      p_employee_id,
      false,
      false
    )
    RETURNING id INTO v_item_id;

    -- Inmediatamente, en el mismo ciclo, insertar los extras_pago de este item
    -- usando el v_item_id recién obtenido — sin ambigüedad de orden posible
    IF v_item->'extras_pago' IS NOT NULL AND jsonb_array_length(v_item->'extras_pago') > 0 THEN
      FOR v_extra IN SELECT * FROM jsonb_array_elements(v_item->'extras_pago')
      LOOP
        INSERT INTO public.order_item_extras (
          order_item_id,
          extra_id,
          nombre_extra,
          precio_adicional
        )
        VALUES (
          v_item_id,
          CASE WHEN v_extra->>'extra_id' IS NOT NULL AND v_extra->>'extra_id' != 'null'
               THEN (v_extra->>'extra_id')::UUID ELSE NULL END,
          v_extra->>'nombre_extra',
          (v_extra->>'precio_adicional')::NUMERIC
        );
      END LOOP;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  -- Cualquier error revierte automáticamente toda la transacción (plpgsql exception handler)
  RAISE;
END;
$$;
