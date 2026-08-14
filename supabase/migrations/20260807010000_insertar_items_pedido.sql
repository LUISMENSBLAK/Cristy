-- Función transaccional para insertar order_items con sus extras en una sola operación atómica.
-- Elimina la ventana de tiempo entre la inserción de order_items y order_item_extras
-- que causaba que los suscriptores en tiempo real (Cocina/Caja) capturaran
-- una foto incompleta del pedido y agruparan incorrectamente productos con extras distintos.
--
-- Parámetros:
--   p_order_id   UUID del pedido al que pertenecen los items
--   p_items      JSONB array de items, cada uno con sus extras_pago anidados
--   p_employee_id UUID del empleado que crea los items

CREATE OR REPLACE FUNCTION public.insertar_items_pedido(
  p_order_id    UUID,
  p_items       JSONB,
  p_employee_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item        JSONB;
  v_extra       JSONB;
  v_item_id     UUID;
BEGIN
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
