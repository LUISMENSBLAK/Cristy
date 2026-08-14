import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('payments')
    .select('*, order:orders(*, tables(numero), order_items(*, product:products(nombre), extra:product_extras!extra_id(nombre), order_item_extras(nombre_extra, precio_adicional))), cobrador:employees!cobrado_por(nombre)')
    .limit(1)

  if (error) {
    console.error('ERROR:', JSON.stringify(error, null, 2))
  } else {
    console.log('SUCCESS:', data?.length)
  }
}

test()
