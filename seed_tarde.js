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

async function seedTarde() {
  console.log("Iniciando actualización de turnos y carga del menú de la tarde...");

  // 1. Update Morning Only products
  const morningUpdates = [
    { nombre: 'Chocolate mexicano', categoria: 'Calientes/Frios' },
    { nombre: 'Especial (CBP)', categoria: 'Croissant/Bagel/Panini' }, // Was named Especial (CBP) in earlier seed to avoid collisions, but let's check name 'Especial'
    { nombre: 'Español', categoria: 'Croissant/Bagel/Panini' },
    { nombre: 'Al pesto', categoria: 'Croissant/Bagel/Panini' },
    { nombre: 'Plato de fruta', categoria: 'Croissant/Bagel/Panini' },
    { nombre: 'Hot cakes', categoria: 'Croissant/Bagel/Panini' },
    { nombre: 'Clásicos (Chilaquiles)', categoria: 'Chilaquiles' },
    { nombre: 'Granjeros', categoria: 'Chilaquiles' },
    { nombre: 'Rancheros', categoria: 'Chilaquiles' },
    { nombre: 'Extra de huevo', categoria: 'Chilaquiles' },
    { nombre: 'Clásico', categoria: 'Omelettes' },
    { nombre: 'Vegetariano', categoria: 'Omelettes' },
    { nombre: 'Especial', categoria: 'Omelettes' },
    // Also including exact names from user prompt in case they were named exactly that:
    { nombre: 'Especial', categoria: 'Croissant/Bagel/Panini' },
    { nombre: 'Clásicos', categoria: 'Chilaquiles' }
  ];

  for (const item of morningUpdates) {
    const { error } = await supabase
      .from('products')
      .update({ turno: 'manana' })
      .eq('nombre', item.nombre)
      .eq('categoria', item.categoria);
    if (error) console.error(`Error actualizando turno para ${item.nombre}:`, error);
  }

  // 2. Recategorizar "Ensalada de la casa"
  const { error: recatError } = await supabase
    .from('products')
    .update({ categoria: 'Ensalada' })
    .eq('nombre', 'Ensalada de la casa')
    .eq('categoria', 'Croissant/Bagel/Panini');
  if (recatError) console.error("Error recategorizando Ensalada de la casa:", recatError);

  // 3. Nuevos productos exclusivos de la tarde
  const tardeProducts = [
    { nombre: 'Chocolate caliente', precio: 50, categoria: 'Calientes/Frios', turno: 'tarde' },
    { nombre: 'Ranch', precio: 125, categoria: 'Ensalada', turno: 'tarde', descripcion: 'Lechugas, tomate cherry, pepino, cebolla, zanahoria, aguacate, crotones, pollo, aderezo ranch y queso parmesano' },
    { nombre: 'Arrachera sencilla', precio: 115, categoria: 'Hamburguesas', turno: 'tarde', descripcion: 'Acompañada de papas gajo con parmesano' },
    { nombre: 'Arrachera doble', precio: 168, categoria: 'Hamburguesas', turno: 'tarde', descripcion: 'Acompañada de papas gajo con parmesano' },
    { nombre: 'Orden de papas', precio: 68, categoria: 'Hamburguesas', turno: 'tarde', descripcion: '—' },
    { nombre: 'Abaroa', precio: 110, categoria: 'Crepas', turno: 'tarde', descripcion: 'Fresa, cajeta, philadelphia, nuez caramelizada y helado de vainilla' },
    { nombre: 'Tropical', precio: 100, categoria: 'Crepas', turno: 'tarde', descripcion: 'Durazno en almíbar, coco, lechera y nieve de vainilla' },
    { nombre: 'Clásica (Crepa)', precio: 90, categoria: 'Crepas', turno: 'tarde', descripcion: 'Fresa, plátano y nutella' },
    { nombre: 'Española (Crepa)', precio: 125, categoria: 'Crepas', turno: 'tarde', descripcion: 'Jamón, queso manchego, aderezo chipotle y queso parmesano, acompañada de ensalada' },
    { nombre: 'Hawaiana', precio: 135, categoria: 'Crepas', turno: 'tarde', descripcion: 'Queso manchego, jamón, piña y aderezo chipotle, acompañada de ensalada' },
    { nombre: 'Armala a tu antojo', precio: 80, categoria: 'Crepas', turno: 'tarde', descripcion: 'Base personalizable', ingredientes_incluidos: 2, precio_ingrediente_extra: 10 },
  ];

  for (const item of tardeProducts) {
    const { error } = await supabase.from('products').insert(item);
    if (error) console.error(`Error insertando ${item.nombre}:`, error);
  }

  // 4. Ingredientes para "Armala a tu antojo"
  const { data: armalaData } = await supabase.from('products').select('id').eq('nombre', 'Armala a tu antojo').single();
  
  if (armalaData) {
    const ingredientes = [
      'Nutella', 'Lechera', 'Cajeta', 'Philadelphia', 'Mermelada de fresa', 
      'Mermelada de frutos rojos', 'Durazno en almíbar', 'Fresas naturales', 
      'Plátano', 'Crema de cacahuate', 'Nuez', 'Coco rayado', 'Chantilly', 
      'Chocolate líquido Hersheys'
    ];

    const ingredsPayload = ingredientes.map(ing => ({
      producto_id: armalaData.id,
      nombre: ing,
      activo: true
    }));

    const { error: ingError } = await supabase.from('product_ingredients').insert(ingredsPayload);
    if (ingError) console.error("Error insertando ingredientes:", ingError);

    // 5. Nieve Extra
    const nieveExtra = {
      nombre: 'Nieve extra',
      precio_adicional: 20,
      producto_id: armalaData.id
    };
    const { error: extraError } = await supabase.from('product_extras').insert(nieveExtra);
    if (extraError) console.error("Error insertando Nieve extra:", extraError);
  }

  console.log("Carga de la tarde completada con éxito.");
}

seedTarde().catch(console.error);
