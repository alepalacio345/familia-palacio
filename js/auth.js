// ============================================================================
//  auth.js - INICIO DE SESION POR ROL
// ============================================================================
//  Valida usuario y clave contra la tabla `usuarios` de Supabase.
//  Ademas de comprobar que exista el usuario, lee su ROL (admin | revendedora)
//  para que el resto de la aplicacion sepa que puede hacer cada quien.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { mostrarPantalla } from "./ui.js";
import { registrarEntradaSesion } from "./sesion.js";

// ----------------------------------------------------------------------------
//  inicializarAuth(alIniciarSesion)
//  Configura el formulario de login y los botones de la pantalla de acceso.
//
//  alIniciarSesion: funcion que se ejecuta UNA VEZ validado el usuario.
//  Esa funcion (definida en main.js) carga todos los datos de la nube,
//  construye el menu y renderiza la interfaz.
// ----------------------------------------------------------------------------
export function inicializarAuth(alIniciarSesion) {
    // --- Formulario de login ---
    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const usuario = document.getElementById("login-usuario").value.trim();
        const clave = document.getElementById("login-clave").value.trim();
        const errorEl = document.getElementById("login-error");
        const btnEntrar = document.getElementById("btn-entrar");

        // Escribir "salir" como usuario cierra el programa (pantalla de salida).
        if (usuario.toLowerCase() === "salir") {
            mostrarPantalla("exit");
            return;
        }

        // Si Supabase no esta configurado, avisamos y no seguimos.
        if (!db) {
            errorEl.textContent = "Configura primero tus credenciales de Supabase en js/config.js.";
            return;
        }

        // Deshabilitamos el boton mientras se valida (evita dobles clics).
        btnEntrar.disabled = true;
        btnEntrar.textContent = "Validando...";
        errorEl.textContent = "";

        // Buscamos el usuario con su clave. Leemos tambien su rol y nombre.
        const { data, error } = await db
            .from("usuarios")
            .select("usuario, rol, nombre")
            .eq("usuario", usuario)
            .eq("clave", clave)
            .maybeSingle();

        btnEntrar.disabled = false;
        btnEntrar.textContent = "Iniciar sesion";

        if (error) {
            errorEl.textContent = `Error de conexion: ${error.message}`;
            return;
        }

        if (!data) {
            errorEl.textContent = "Usuario o clave incorrectos.";
            return;
        }

        // Guardamos quien entro (usuario + rol). Si el rol viene vacio,
        // lo tratamos como 'admin' para no romper usuarios viejos.
        state.usuarioActual = {
            usuario: data.usuario,
            rol: data.rol || "admin",
            nombre: data.nombre || data.usuario,
        };

        document.getElementById("login-form").reset();
        mostrarPantalla("app");

        // Cargamos datos y construimos la interfaz segun el rol.
        await alIniciarSesion();

        // Registramos la hora de entrada en la tabla `sesiones`.
        await registrarEntradaSesion();
    });

    // --- Botones de la pantalla de login/salida ---
    document.getElementById("btn-salir-login").addEventListener("click", () => mostrarPantalla("exit"));
    document.getElementById("btn-volver-login").addEventListener("click", () => mostrarPantalla("login"));
}
