import { createClient } from '@supabase/supabase-js'

try {
  const admin = createClient('https://xxx.supabase.co', undefined)
  console.log('Created successfully')
} catch (err) {
  console.log('CRASH:', err.message)
}
