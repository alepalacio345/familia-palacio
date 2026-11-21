export const SUPABASE_URL = "https://qpbiobyenospczawncbl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_If_rqLH0O3a17633ZIzZiA_09lW7feV";

export let db = null;

export function iniciarSupabase() {
    const badge = document.getElementById("status-nube-login");
    const sinConfigurar =
        SUPABASE_URL.includes("TU-PROYECTO") ||
        SUPABASE_ANON_KEY.includes("TU-ANON-KEY");

    if (sinConfigurar || !window.supabase) {
        badge.textContent = "Error: verifica las credenciales de Supabase en js/config.js";
        return false;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    badge.textContent = "Conectado a Supabase";
    badge.classList.add("connected");
    return true;
}