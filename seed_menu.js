const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const menu = [
  // Calientes/Frios
  { nombre: 'Americano', precio: 50, categoria: 'Calientes/Frios' },
  { nombre: 'Latte', precio: 65, categoria: 'Calientes/Frios' },
  { nombre: 'Caramel latte', precio: 70, categoria: 'Calientes/Frios' },
  { nombre: 'Moka latte', precio: 70, categoria: 'Calientes/Frios' },
  { nombre: 'Chai latte', precio: 70, categoria: 'Calientes/Frios' },
  { nombre: 'Chai latte guayaba', precio: 70, categoria: 'Calientes/Frios' },
  { nombre: 'Avellana latte', precio: 75, categoria: 'Calientes/Frios' },
  { nombre: 'Matcha latte', precio: 75, categoria: 'Calientes/Frios' },
  { nombre: 'Taro', precio: 70, categoria: 'Calientes/Frios' },
  { nombre: 'Chocolate mexicano', precio: 50, categoria: 'Calientes/Frios' },

  // Frappes
  { nombre: 'Café (Frappe)', precio: 75, categoria: 'Frappes' }, // Added (Frappe) to avoid name collision if unique? Not unique constraint. Keep original name:
  { nombre: 'Café', precio: 75, categoria: 'Frappes' },
  { nombre: 'Moka', precio: 75, categoria: 'Frappes' },
  { nombre: 'Avellana', precio: 80, categoria: 'Frappes' },
  { nombre: 'Galleta oreo', precio: 80, categoria: 'Frappes' },
  { nombre: 'Cajeta', precio: 80, categoria: 'Frappes' },

  // Smoothies
  { nombre: 'Fresa', precio: 80, categoria: 'Smoothies' },
  { nombre: 'Frutos rojos', precio: 80, categoria: 'Smoothies' },
  { nombre: 'Mango', precio: 80, categoria: 'Smoothies' },

  // Malteadas
  { nombre: 'Fresa (Malteada)', precio: 80, categoria: 'Malteadas' },
  { nombre: 'Vainilla', precio: 80, categoria: 'Malteadas' },
  { nombre: 'Chocolate', precio: 80, categoria: 'Malteadas' },

  // Limonadas
  { nombre: 'Clásica', precio: 65, categoria: 'Limonadas' },
  { nombre: 'Fresa (Limonada)', precio: 70, categoria: 'Limonadas' },
  { nombre: 'Frutos rojos (Limonada)', precio: 75, categoria: 'Limonadas' },
  { nombre: 'Maracuyá', precio: 75, categoria: 'Limonadas' },

  // Especiales
  { nombre: 'Matcha con fresa', precio: 88, categoria: 'Especiales' },
  { nombre: 'Taro con fresa', precio: 88, categoria: 'Especiales' },
  { nombre: 'Naranjo expresso', precio: 85, categoria: 'Especiales' },
  { nombre: 'Jugo de naranja', precio: 65, categoria: 'Especiales' },

  // Chilaquiles
  { nombre: 'Clásicos (Chilaquiles)', precio: 98, categoria: 'Chilaquiles', descripcion: 'Totopos, salsa roja, queso, crema, cebolla y frijoles' },
  { nombre: 'Granjeros', precio: 145, categoria: 'Chilaquiles', descripcion: 'Totopos, salsa roja, queso, crema, cebolla, pollo y frijoles' },
  { nombre: 'Rancheros', precio: 180, categoria: 'Chilaquiles', descripcion: 'Totopos, salsa roja, crema, cebolla, arrachera y frijoles' },
  { nombre: 'Extra de huevo', precio: 12, categoria: 'Chilaquiles', descripcion: 'Pieza de huevo estrellado o revuelto' },

  // Omelettes
  { nombre: 'Clásico', precio: 98, categoria: 'Omelettes', descripcion: 'Jamón de pavo y queso, con frijoles y ensalada' },
  { nombre: 'Vegetariano', precio: 118, categoria: 'Omelettes', descripcion: 'Espinaca, cebolla, champiñones y queso, con frijoles y ensalada' },
  { nombre: 'Especial', precio: 148, categoria: 'Omelettes', descripcion: 'Jamón de pavo y queso, fruta del día picada y mini hot cakes' },

  // Croissant/Bagel/Panini
  { nombre: 'Pavo', precio: 98, categoria: 'Croissant/Bagel/Panini', descripcion: 'Jamón de pavo, queso manchego y ensalada' },
  { nombre: 'Granjero (CBP)', precio: 125, categoria: 'Croissant/Bagel/Panini', descripcion: 'Pollo, queso manchego y ensalada' },
  { nombre: 'Especial (CBP)', precio: 148, categoria: 'Croissant/Bagel/Panini', descripcion: 'Pollo, queso manchego, fruta del día y mini hot cakes' },
  { nombre: 'Español', precio: 148, categoria: 'Croissant/Bagel/Panini', descripcion: 'Jamón serrano, queso manchego y ensalada' },
  { nombre: 'Al pesto', precio: 148, categoria: 'Croissant/Bagel/Panini', descripcion: 'Pollo, cebolla, queso manchego, pesto y ensalada' },
  { nombre: 'Ensalada de la casa', precio: 125, categoria: 'Croissant/Bagel/Panini', descripcion: 'Lechugas, fresas naturales, arándanos, nueces, aguacate, cebolla, vinagreta italiana, crotones, pollo y queso parmesano' },
  { nombre: 'Plato de fruta', precio: 58, categoria: 'Croissant/Bagel/Panini', descripcion: 'Melón, papaya, fresa, plátano, granola y miel' },
  { nombre: 'Hot cakes', precio: 78, categoria: 'Croissant/Bagel/Panini', descripcion: 'Chantilly, fresa, plátano, miel, lechera, nutella, mermelada de fresa (2 ing a elegir)' },
];

async function seedMenu() {
  console.log("Seeding menu items...");

  // First clear old products just to be clean if needed?
  // We will just insert or upsert. Let's insert blindly, assuming empty table.
  
  for (const item of menu) {
    const { error } = await supabase.from('products').insert(item);
    if (error) console.error(`Failed to insert ${item.nombre}:`, error);
  }
  console.log("Menu inserted.");

  // Fetch the ID of 'Hot cakes' for the specific extra
  const { data: hotCakes } = await supabase.from('products').select('id').eq('nombre', 'Hot cakes').single();

  console.log("Seeding extras...");
  const extras = [
    { nombre: 'Bebida fría', precio_adicional: 10, categoria_aplicable: 'Calientes/Frios' },
    { nombre: 'Leche deslactosada', precio_adicional: 5, categoria_aplicable: 'Frappes' },
    { nombre: 'Ingrediente extra', precio_adicional: 10, categoria_aplicable: null, producto_id: hotCakes?.id }
  ];

  for (const extra of extras) {
    const { error } = await supabase.from('product_extras').insert(extra);
    if (error) console.error(`Failed to insert extra ${extra.nombre}:`, error);
  }

  console.log("Extras inserted. Seed completed.");
}

seedMenu().catch(console.error);
