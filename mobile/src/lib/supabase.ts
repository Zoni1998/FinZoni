import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://jbzypqaimerrptxhovzq.supabase.co';
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_hQ2QoIaF4eL9JlX_49NzHQ_hobaAnLi';

export const finzoniApiUrl = process.env.EXPO_PUBLIC_FINZONI_API_URL ?? 'https://fin-zoni.vercel.app';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

