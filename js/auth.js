import { db } from "./config.js";
import { mostrarPantalla } from "./ui.js";

export function inicializarAuth(alIniciarSesion) {
    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const usuario = document.getElementById("login-usuario").value.trim();
        const clave = document.getElementById("login-clave").value.trim();
        const errorEl = document.getElementById("login-error");
        const btnEntrar = document.getElementById("btn-entrar");

        if (usuario.toLowerCase() === "salir") {
            mostrarPantalla("exit");
            return;
        }

        if (!db) {
            errorEl.textContent = "Configura primero tus credenciales de Supabase en js/config.js.";
            return;
        }

        btnEntrar.disabled = true;
        btnEntrar.textContent = "Validando...";
        errorEl.textContent = "";

        const { data, error } = await db
            .from("usuarios")
            .select("usuario")
            .eq("usuario", usuario)
            .eq("clave", clave)
            .maybeSingle();

        btnEntrar.disabled = false;
        btnEntrar.textContent = "Iniciar sesion";

        if (error) {
            errorEl.textContent = `Error de conexion: ${error.message}`;
            return;
        }

        if (data) {
            document.getElementById("login-form").reset();
            mostrarPantalla("app");
            await alIniciarSesion();
        } else {
            errorEl.textContent = "Usuario o clave incorrectos.";
        }
    });

    document.getElementById("btn-salir-login").addEventListener("click", () => mostrarPantalla("exit"));
    document.getElementById("btn-cerrar-sesion").addEventListener("click", () => mostrarPantalla("exit"));
    document.getElementById("btn-volver-login").addEventListener("click", () => mostrarPantalla("login"));
}