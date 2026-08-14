import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('movements')
    .select('*, created_by:employees(nombre)')
    .limit(1)

  if (error) {
    console.error('ERROR:', JSON.stringify(error, null, 2))
  } else {
    console.log('SUCCESS:', data)
  }
}

test()
