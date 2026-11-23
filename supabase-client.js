// ============================================================================
// CONFIGURACIÓN DEL CLIENTE DE SUPABASE
// ============================================================================
// Este archivo se encarga de conectar nuestra página web con la base de datos
// de Supabase utilizando la librería oficial @supabase/supabase-js.
// ============================================================================

// Puedes reemplazar estos valores con los de tu proyecto de Supabase:
// Encuéntralos en: Supabase Dashboard -> Project Settings -> API
// O déjalos vacíos y la web te pedirá ingresarlos la primera vez en pantalla.
const DEFAULT_SUPABASE_URL = "";
const DEFAULT_SUPABASE_ANON_KEY ="";

// Intentamos leer del almacenamiento local del navegador (localStorage)
// o usamos los valores por defecto escritos arriba.
const SUPABASE_URL = localStorage.getItem("dulces_supabase_url") || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = localStorage.getItem("dulces_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;

// Variable global donde guardaremos la instancia de Supabase
let db = null;

/**
 * Función para inicializar la conexión con Supabase.
 * Retorna true si se conectó correctamente, o false si faltan las credenciales.
 */
function inicializarSupabase() {
    const url = localStorage.getItem("dulces_supabase_url") || DEFAULT_SUPABASE_URL;
    const key = localStorage.getItem("dulces_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.warn("⚠️ Aún no se han configurado la URL o la ANON_KEY de Supabase.");
        return false;
    }

    try {
        // window.supabase proviene del script cargado en el HTML desde el CDN
        db = window.supabase.createClient(url, key);
        console.log("✅ Conexión con Supabase inicializada con éxito.");
        return true;
    } catch (error) {
        console.error("❌ Error al inicializar Supabase:", error);
        return false;
    }
}

/**
 * Guarda las credenciales en el navegador para que no tengas que escribirlas de nuevo.
 */
function guardarCredencialesSupabase(url, key) {
    localStorage.setItem("dulces_supabase_url", url.trim());
    localStorage.setItem("dulces_supabase_anon_key", key.trim());
    return inicializarSupabase();
}

/**
 * Borra las credenciales guardadas si deseas cambiarlas de proyecto.
 */
function reiniciarCredencialesSupabase() {
    localStorage.removeItem("dulces_supabase_url");
    localStorage.removeItem("dulces_supabase_anon_key");
    window.location.reload();
}

// Inicializamos al cargar el archivo
inicializarSupabase();
