// ============================================================================
// CONFIGURACIÓN DEL CLIENTE DE SUPABASE
// ============================================================================

// Pega aquí tu URL y tu Anon Key (Supabase -> Project Settings -> API)
const DEFAULT_SUPABASE_URL = "https://fwvgynuanopqczfxvddh.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "";

// Variable global donde guardaremos la instancia de Supabase
let db = null;

function inicializarSupabase() {
    const url = localStorage.getItem("dulces_supabase_url") || DEFAULT_SUPABASE_URL;
    const key = localStorage.getItem("dulces_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.warn("⚠️ Aún no se han configurado la URL o la ANON_KEY de Supabase.");
        return false;
    }

    try {
        db = window.supabase.createClient(url, key);
        console.log("✅ Conexión con Supabase inicializada con éxito.");
        return true;
    } catch (error) {
        console.error("❌ Error al inicializar Supabase:", error);
        return false;
    }
}

function guardarCredencialesSupabase(url, key) {
    localStorage.setItem("dulces_supabase_url", url.trim());
    localStorage.setItem("dulces_supabase_anon_key", key.trim());
    return inicializarSupabase();
}

function reiniciarCredencialesSupabase() {
    localStorage.removeItem("dulces_supabase_url");
    localStorage.removeItem("dulces_supabase_anon_key");
    window.location.reload();
}

// Inicializamos al cargar el archivo
inicializarSupabase();
