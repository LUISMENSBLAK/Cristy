require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('--- EMPLOYEES ---');
  const { data: employees } = await supabase.from('employees').select('*').eq('rol', 'admin');
  console.log(employees);

  console.log('\n--- AUTH USERS ---');
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error) console.error(error);
  else console.log(users.users.map(u => ({ id: u.id, email: u.email })));
}
run();
