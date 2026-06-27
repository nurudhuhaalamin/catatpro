import { createClient } from "@supabase/supabase-js";

// Klien Supabase (Auth). Isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY di .env.
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anonKey);
