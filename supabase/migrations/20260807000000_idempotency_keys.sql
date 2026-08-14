-- Tabla de llaves de idempotencia para evitar duplicados por reintento de red
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key UUID PRIMARY KEY,
  creado_en TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS para que solo el servidor pueda escribir
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Solo el rol service_role (server actions) puede insertar/leer
CREATE POLICY "service_only" ON public.idempotency_keys
  USING (true)
  WITH CHECK (true);

-- Función de limpieza: borra llaves de más de 24h para no acumular basura
CREATE OR REPLACE FUNCTION public.limpiar_idempotency_keys_viejas()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.idempotency_keys WHERE creado_en < now() - interval '24 hours';
$$;
