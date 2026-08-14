require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@abaroa.local',
    password: 'admin'
  });
  console.log("Login result:");
  if (error) console.error(error.message);
  else console.log("Success! Role in auth:", data.user.role);
}
run();
