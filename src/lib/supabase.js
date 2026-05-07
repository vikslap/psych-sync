import { createClient } from "@supabase/supabase-js";

// These point to the KEYS in your .env.local file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log(
  "Supabase URL Check:",
  import.meta.env.VITE_SUPABASE_URL ? "Loaded" : "MISSING",
);
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
