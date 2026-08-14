const { createClient } = require('@supabase/supabase-js');

// Load environment variables if running locally via Node
// You can run this with: node --env-file=.env.local seed.js 
// or manually load dotenv

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seed() {
  console.log("Starting database seed...");

  // 1. Create Admin User in Supabase Auth
  const adminEmail = 'admin@abaroa.local';
  const adminPassword = 'admin123'; // You should change this after first login

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });

  if (authError) {
    // Handle both possible "already exists" messages from Supabase
    const alreadyExists = authError.code === 'email_exists' ||
      authError.message.includes('already exists') ||
      authError.message.includes('already been registered');
    if (alreadyExists) {
      console.log("Admin user already exists in Auth — continuing.");
    } else {
      console.error("Error creating auth user:", authError);
      process.exit(1);
    }
  }

  let adminId = authData?.user?.id;

  // If user already existed, fetch the ID
  if (!adminId) {
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = usersData.users.find(u => u.email === adminEmail);
    if (existing) {
      adminId = existing.id;
    } else {
      console.error("Could not fetch existing admin user ID.");
      process.exit(1);
    }
  }

  console.log("Admin Auth ID:", adminId);

  // 2. Insert Admin into `employees` table
  const { error: empError } = await supabase
    .from('employees')
    .upsert({
      id: adminId,
      nombre: 'Administrador',
      pin: '0000', // Unused for admin (admin uses email login), required by schema NOT NULL
      rol: 'admin',
      activo: true
    });

  if (empError) {
    console.error("Error inserting admin into employees table:", empError);
  } else {
    console.log("Admin inserted into employees table.");
  }

  // 3. Create a test Mesero employee with PIN: 1111 so PIN login works immediately
  const testPin = '1111';
  const testEmail = `test_mesero_${Date.now()}@abaroa.local`;
  const { data: meseroAuth, error: meseroAuthErr } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPin,
    email_confirm: true
  });

  if (meseroAuthErr) {
    console.log("Test mesero auth error (may already exist):", meseroAuthErr.message);
  } else if (meseroAuth?.user) {
    const meseroId = meseroAuth.user.id;
    // Update email to the consistent format
    await supabase.auth.admin.updateUserById(meseroId, { email: `emp_${meseroId}@abaroa.local` });
    await supabase.from('employees').upsert({
      id: meseroId,
      nombre: 'Mesero Demo',
      pin: testPin,
      rol: 'mesero',
      activo: true
    });
    console.log(`Test Mesero employee created — PIN: ${testPin}`);
  }

  // 3. Create some initial tables (mesas)
  const mesas = [
    { numero: '1', estado: 'libre' },
    { numero: '2', estado: 'libre' },
    { numero: '3', estado: 'libre' },
    { numero: '4', estado: 'libre' },
    { numero: '5', estado: 'libre' },
  ];

  const { error: tablesError } = await supabase
    .from('tables')
    .upsert(mesas, { onConflict: 'numero' });

  if (tablesError) {
    console.error("Error seeding tables:", tablesError);
  } else {
    console.log("Initial tables (1-5) seeded.");
  }

  // 4. Create some default products for testing
  const productos = [
    { nombre: 'Café Americano', precio: 35.00, categoria: 'Bebidas' },
    { nombre: 'Latte', precio: 50.00, categoria: 'Bebidas' },
    { nombre: 'Croissant', precio: 45.00, categoria: 'Panadería' },
    { nombre: 'Rebanada de Pastel', precio: 65.00, categoria: 'Postres' }
  ];

  for (const p of productos) {
    // Only insert if doesn't exist to avoid duplicates on re-run
    const { data: existing } = await supabase.from('products').select('id').eq('nombre', p.nombre).single();
    if (!existing) {
      await supabase.from('products').insert(p);
    }
  }
  
  console.log("Initial products seeded.");
  console.log("Seed completed successfully!");
}

seed().catch(console.error);
