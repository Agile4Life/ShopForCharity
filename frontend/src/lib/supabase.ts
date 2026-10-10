import { createClient } from '@supabase/supabase-js';
import { withRequestDeadline } from './request-state';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb-dummy-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (input, init) => withRequestDeadline(async signal => {
      const response = await fetch(input, { ...init, signal });
      const body = await response.arrayBuffer();
      return new Response(response.status === 204 ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
    }, { signal: init?.signal, write: init?.method !== 'GET' }),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}
