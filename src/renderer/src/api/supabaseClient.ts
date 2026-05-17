import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase 환경변수가 설정되지 않았습니다.\n' +
    'Netlify 환경변수에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 추가해주세요.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
