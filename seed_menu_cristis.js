const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) throw new Error('Falta SUPABASE_DB_URL en las variables de entorno');

function variantExtras(opciones) {
  return opciones.map(o => ({ nombre: o, precio_adicional: 0, es_variante_unica: true }));
}
function paidExtra(nombre, precio) {
  return { nombre, precio_adicional: precio, es_variante_unica: false };
}

const LECHE_VEGETAL = { nombre: 'Leche de coco/almendra/soya', precio_adicional: 10, es_variante_unica: false };
const CARGA_CAFE    = { nombre: 'Carga extra de café', precio_adicional: 10, es_variante_unica: false };

const PRODUCTS = [
  // ── COMIDA ──────────────────────────────────────────────────────────────────
  // Burritos
  { nombre: 'Burrito Pierna/Pollo', precio: 30, categoria: 'Comida',
    descripcion: 'Con carne deshebrada y queso cheddar en tortilla de harina. Acompañado de frijoles y ensalada.',
    extras: [...variantExtras(['Pierna','Pollo']), paidExtra('Tamaño Grande',10)] },
  { nombre: 'Burrito Asada', precio: 30, categoria: 'Comida',
    descripcion: 'Bistec de res con queso cheddar. Acompañado de frijoles y ensalada.',
    extras: [paidExtra('Tamaño Grande',15)] },
  { nombre: 'Burrito Breakfast', precio: 45, categoria: 'Comida',
    descripcion: 'Huevo, queso cheddar y tocino, o huevo, queso cheddar y vegetales. Acompañado de ensalada, frijoles y papas.',
    extras: [...variantExtras(['Tocino','Vegetales']), paidExtra('Tamaño Grande',35)] },
  // Sandwiches
  { nombre: 'Sandwich Pierna/Pollo/Jamón/Asada', precio: 70, categoria: 'Comida',
    descripcion: 'Con queso cheddar. Acompañado de papas y ensalada.',
    extras: variantExtras(['Pierna','Pollo','Jamón','Asada']) },
  { nombre: 'Sandwich Combinado', precio: 80, categoria: 'Comida',
    descripcion: 'Dos ingredientes a elegir entre pierna, pollo, jamón o asada. Acompañado de papas y ensalada.',
    extras: [], ingredientes: ['Pierna','Pollo','Jamón','Asada'] },
  { nombre: 'Sandwich Breakfast', precio: 80, categoria: 'Comida',
    descripcion: 'Huevo, queso y tocino, o huevo, queso y vegetales. Acompañado de papas y ensalada.',
    extras: variantExtras(['Tocino','Vegetales']) },
  // Sincronizadas
  { nombre: 'Sincronizada Pierna/Pollo/Jamón/Asada', precio: 50, categoria: 'Comida',
    descripcion: 'Con queso cheddar en tortilla de harina. Acompañada de ensalada.',
    extras: [...variantExtras(['Pierna','Pollo','Jamón','Asada']), paidExtra('Tamaño Grande',20)] },
  { nombre: 'Sincronizada Combinada', precio: 55, categoria: 'Comida',
    descripcion: 'Dos ingredientes a elegir entre pierna, pollo, jamón o asada. Acompañada de ensalada.',
    extras: [paidExtra('Tamaño Grande',25)], ingredientes: ['Pierna','Pollo','Jamón','Asada'] },
  // Croissants
  { nombre: 'Croissant Clásico', precio: 70, categoria: 'Comida',
    descripcion: 'Con jamón y queso cheddar. Acompañado de ensalada.', extras: [] },
  { nombre: 'Croissant Breakfast', precio: 80, categoria: 'Comida',
    descripcion: 'Huevo, queso cheddar y tocino, o huevo, queso cheddar y vegetales. Acompañado de ensalada y papas.',
    extras: variantExtras(['Tocino','Vegetales']) },
  // Bagels
  { nombre: 'Bagel Jamón/Pierna/Pollo/Asada', precio: 80, categoria: 'Comida',
    descripcion: 'Con queso cheddar, acompañado de ensalada.',
    extras: variantExtras(['Jamón','Pierna','Pollo','Asada']) },
  { nombre: 'Bagel Breakfast', precio: 95, categoria: 'Comida',
    descripcion: 'Huevo, queso y tocino, o huevo, queso y vegetales. Acompañado de papas y ensalada.',
    extras: variantExtras(['Tocino','Vegetales']) },
  // Paninis
  { nombre: 'Panini Pierna/Pollo/Panela/Jamón', precio: 95, categoria: 'Comida',
    descripcion: 'Con queso cheddar. Acompañado de ensalada.',
    extras: [...variantExtras(['Pierna','Pollo','Panela','Jamón']), ...variantExtras(['Baguette','Chapatta'])] },
  { nombre: 'Panini Combinado', precio: 110, categoria: 'Comida',
    descripcion: 'Dos ingredientes a elegir entre pierna, pollo, panela o asada. Acompañado de ensalada.',
    extras: variantExtras(['Baguette','Chapatta']), ingredientes: ['Pierna','Pollo','Panela','Asada'] },
  { nombre: 'Panini Asada y queso', precio: 110, categoria: 'Comida',
    descripcion: 'Acompañado de ensalada.', extras: variantExtras(['Baguette','Chapatta']) },
  { nombre: 'Panini Breakfast', precio: 120, categoria: 'Comida',
    descripcion: 'Huevo, queso y tocino, o huevo, queso y vegetales. Acompañado de papas y ensalada.',
    extras: [...variantExtras(['Tocino','Vegetales']), ...variantExtras(['Baguette','Chapatta'])] },
  { nombre: 'Panini Pizza', precio: 115, categoria: 'Comida',
    descripcion: 'Puré de tomate, queso, jamón y peperoni.', extras: variantExtras(['Baguette','Chapatta']) },
  { nombre: 'Panini Vegetariana', precio: 110, categoria: 'Comida',
    descripcion: 'Vegetales con queso. Acompañado de papas y ensalada.', extras: variantExtras(['Baguette','Chapatta']) },
  // Tortas
  { nombre: 'Torta Jamón con queso/Pierna/Pollo/Panela', precio: 60, categoria: 'Comida',
    extras: variantExtras(['Jamón con queso','Pierna','Pollo','Panela']) },
  { nombre: 'Torta Asada con queso', precio: 70, categoria: 'Comida', extras: [] },
  { nombre: 'Torta Cubana', precio: 75, categoria: 'Comida', extras: [] },
  { nombre: 'Torta Breakfast', precio: 75, categoria: 'Comida',
    descripcion: 'Huevo, queso y tocino. Acompañado de ensalada.', extras: [] },
  // ── BEBIDAS ─────────────────────────────────────────────────────────────────
  // Bebidas Calientes
  { nombre: 'Americano',    precio: 50, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Espresso',     precio: 40, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Capuccino',    precio: 60, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Latte',        precio: 60, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Mocha',        precio: 65, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Chai Latte',   precio: 65, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Matcha Latte', precio: 65, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Chocolate',    precio: 60, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Té',           precio: 40, categoria: 'Bebidas', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  // Bebidas Frías
  { nombre: 'Chocomilk', precio: 50, categoria: 'Bebidas',
    extras: [{ nombre: 'Leche vegetal/soya/almendra', precio_adicional: 10, es_variante_unica: false }, CARGA_CAFE] },
  { nombre: 'Licuado', precio: 60, categoria: 'Bebidas',
    extras: variantExtras(['Fresa','Plátano','Café','Oreo','Vainilla']) },
  { nombre: 'Ice Coffee Black', precio: 50, categoria: 'Bebidas',
    descripcion: 'Espresso en las rocas.', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Ice Coffee Latte', precio: 60, categoria: 'Bebidas',
    descripcion: 'Espresso y leche en las rocas.', extras: [LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Frappé', precio: 70, categoria: 'Bebidas',
    extras: [...variantExtras(['Café','Vainilla','Chocolate','Fresa','Plátano']), LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Frappé Oreo o Mocca', precio: 80, categoria: 'Bebidas',
    extras: [...variantExtras(['Oreo','Mocca']), LECHE_VEGETAL, CARGA_CAFE] },
  { nombre: 'Frappé Chai o Matcha', precio: 80, categoria: 'Bebidas',
    extras: [...variantExtras(['Chai','Matcha']), LECHE_VEGETAL, CARGA_CAFE] },
  // Fresco y Natural
  { nombre: 'Jugo de naranja',   precio: 60, categoria: 'Bebidas', extras: [] },
  { nombre: 'Jugo verde',         precio: 80, categoria: 'Bebidas', extras: [] },
  { nombre: 'Fresada',            precio: 60, categoria: 'Bebidas', extras: [] },
  { nombre: 'Smoothie NaraFresa', precio: 80, categoria: 'Bebidas', extras: [] },
  { nombre: "Smoothie Cristi's",  precio: 85, categoria: 'Bebidas', extras: [] },
  { nombre: 'Agua Fresca 500 mL', precio: 25, categoria: 'Bebidas',
    extras: variantExtras(['Limón con chía','Horchata de fresa','Jamaica']) },
  { nombre: 'Limonada/Naranjada', precio: 50, categoria: 'Bebidas',
    extras: variantExtras(['Limonada','Naranjada']) },
  // Refrescantes
  { nombre: 'Coca',             precio: 30, categoria: 'Bebidas', extras: [] },
  { nombre: 'Squirt',           precio: 30, categoria: 'Bebidas', extras: [] },
  { nombre: 'Sidral',           precio: 30, categoria: 'Bebidas', extras: [] },
  { nombre: 'Agua embotellada', precio: 10, categoria: 'Bebidas', extras: [] },
];

async function seed() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let inserted = 0, skipped = 0;

  for (const p of PRODUCTS) {
    const exists = await client.query('SELECT id FROM public.products WHERE nombre=$1 LIMIT 1', [p.nombre]);
    if (exists.rows.length > 0) { console.log('SKIP:', p.nombre); skipped++; continue; }

    const res = await client.query(
      `INSERT INTO public.products (nombre, precio, categoria, descripcion, activo)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [p.nombre, p.precio, p.categoria, p.descripcion ?? null]
    );
    const pid = res.rows[0].id;

    for (const e of (p.extras ?? [])) {
      await client.query(
        `INSERT INTO public.product_extras (producto_id, nombre, precio_adicional, es_variante_unica, activo)
         VALUES ($1,$2,$3,$4,true)`,
        [pid, e.nombre, e.precio_adicional, e.es_variante_unica]
      );
    }
    for (const ing of (p.ingredientes ?? [])) {
      await client.query(
        `INSERT INTO public.product_ingredients (producto_id, nombre, activo) VALUES ($1,$2,true)`,
        [pid, ing]
      );
    }
    console.log('OK:', p.nombre, `$${p.precio}`);
    inserted++;
  }

  await client.end();
  console.log(`\nDone — inserted: ${inserted}, skipped: ${skipped}`);
}

seed().catch(e => { console.error(e); process.exit(1); });
