require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  const existing = usersData.users.find(u => u.email === 'admin@abaroa.local');
  
  if (existing) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: 'admin'
    });
    if (error) console.error("Error updating password:", error.message);
    else console.log("Password successfully reset to 'admin'");
  } else {
    console.log("Admin user not found.");
  }
}
run();
