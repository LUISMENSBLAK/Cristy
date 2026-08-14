-- Initial Schema for Abaroa Bakery POS

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- EMPLOYEES
CREATE TABLE public.employees (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  pin TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL CHECK (rol IN ('mesero', 'cocina', 'caja', 'admin')),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access employees" ON public.employees FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);
CREATE POLICY "Authenticated users can read employees" ON public.employees FOR SELECT USING (auth.role() = 'authenticated');

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  precio NUMERIC(10, 2) NOT NULL,
  foto_url TEXT,
  categoria TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read products" ON public.products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can modify products" ON public.products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);

-- TABLES (Mesas)
CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL CHECK (estado IN ('libre', 'ocupada')) DEFAULT 'libre'
);
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read tables" ON public.tables FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can modify tables" ON public.tables FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);
CREATE POLICY "Mesero and Caja can update table status" ON public.tables FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol IN ('mesero', 'caja'))
);

-- ORDERS (Pedidos)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('mesa', 'domicilio', 'para_llevar')),
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  estado TEXT NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'cancelado')) DEFAULT 'abierto',
  enviado_a_cocina BOOLEAN NOT NULL DEFAULT false,
  creado_por UUID REFERENCES public.employees(id),
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read orders" ON public.orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Mesero can insert orders" ON public.orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'mesero')
);
CREATE POLICY "Authenticated can update orders" ON public.orders FOR UPDATE USING (auth.role() = 'authenticated');

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10, 2) NOT NULL,
  pagado BOOLEAN NOT NULL DEFAULT false,
  cancelado BOOLEAN NOT NULL DEFAULT false,
  motivo_cancelacion TEXT,
  cancelado_en TIMESTAMP WITH TIME ZONE,
  listo BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read order_items" ON public.order_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Mesero can insert order_items" ON public.order_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'mesero')
);
CREATE POLICY "Authenticated can update order_items" ON public.order_items FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Mesero can delete order_items" ON public.order_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'mesero')
);

-- PAYMENTS (Pagos)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'tarjeta')),
  monto_recibido NUMERIC(10, 2),
  monto_cobrado NUMERIC(10, 2) NOT NULL,
  cambio NUMERIC(10, 2),
  item_ids UUID[] NOT NULL,
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payments" ON public.payments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Caja can insert payments" ON public.payments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'caja')
);

-- MOVEMENTS (Ingresos/Egresos)
CREATE TABLE public.movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  monto NUMERIC(10, 2) NOT NULL,
  descripcion TEXT NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  creado_por UUID REFERENCES public.employees(id)
);
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read/write movements" ON public.movements FOR ALL USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);

-- STORAGE BUCKET FOR PHOTOS
INSERT INTO storage.buckets (id, name, public) VALUES ('productos', 'productos', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Public read products images" ON storage.objects FOR SELECT USING ( bucket_id = 'productos' );
CREATE POLICY "Admin can insert products images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'productos' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);
CREATE POLICY "Admin can delete products images" ON storage.objects FOR DELETE USING (
  bucket_id = 'productos' AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.rol = 'admin')
);
