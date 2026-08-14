-- ============================================================
-- ABAROA POS — Personalización de Tickets
-- ============================================================

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ticket_tamano_fuente TEXT DEFAULT 'normal' CHECK (ticket_tamano_fuente IN ('pequena','normal','grande'));
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ticket_mensaje_despedida TEXT DEFAULT '¡Gracias por su compra! Vuelva pronto.';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ticket_mostrar_atendido_por BOOLEAN DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS ticket_mostrar_logo BOOLEAN DEFAULT true;

NOTIFY pgrst, 'reload schema';
