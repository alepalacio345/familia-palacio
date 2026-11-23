// ============================================================================
//  sesion.js - ROLES, PERMISOS, SIDEBAR Y REGISTRO DE SESIONES
// ============================================================================
//  Este modulo maneja TODO lo relacionado con "quien esta usando el sistema":
//
//    1) Saber si el usuario actual es ADMIN o REVENDEDORA.
//    2) Construir el menu lateral (sidebar) con SOLO los modulos que le
//       corresponden a su rol.
//    3) Mostrar/ocultar paneles al hacer clic en el menu.
//    4) Registrar en la tabla `sesiones` a que hora entro y a que hora salio
//       cada usuario.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { mostrarPantalla, mostrarAlerta } from "./ui.js";

// ----------------------------------------------------------------------------
// Funciones rapidas para saber el rol del usuario actual.
// ----------------------------------------------------------------------------

/** Devuelve true si el usuario actual es ADMIN (el dueno, con mas poder). */
export function esAdmin() {
    return state.usuarioActual && state.usuarioActual.rol !== "revendedora";
}

/** Devuelve true si el usuario actual es REVENDEDORA. */
export function esRevendedora() {
    return state.usuarioActual && state.usuarioActual.rol === "revendedora";
}

// ----------------------------------------------------------------------------
// DEFINICION DEL MENU LATERAL (sidebar)
// ----------------------------------------------------------------------------
//  Cada item indica:
//    - panel: el id de la seccion HTML que abre.
//    - texto: etiqueta que se muestra.
//    - icono: emoji/icono decorativo.
//    - roles: lista de roles que PUEDEN ver ese item.
// ----------------------------------------------------------------------------
const ITEMS_MENU = [
    { panel: "panel-inventario",   texto: "Inventario",          icono: "📦", roles: ["admin"] },
    { panel: "panel-venta",        texto: "Venta / Entrega",     icono: "🧾", roles: ["admin"] },
    { panel: "panel-entregas",     texto: "Historial de Entregas", icono: "📋", roles: ["admin"] },
    { panel: "panel-reventas",     texto: "Reventas",            icono: "💸", roles: ["admin", "revendedora"] },
    { panel: "panel-caja",         texto: "Dinero / Caja",       icono: "💰", roles: ["admin"] },
    { panel: "panel-stock",        texto: "Disponibilidad",      icono: "🏬", roles: ["admin", "revendedora"] },
    { panel: "panel-sesiones",     texto: "Accesos (Sesiones)",  icono: "🕒", roles: ["admin"] },
];

// ----------------------------------------------------------------------------
//  construirSidebar()
//  Dibuja el menu lateral segun el rol del usuario actual.
//  Tambien deja el primer panel permitido como activo.
// ----------------------------------------------------------------------------
export function construirSidebar() {
    const nav = document.getElementById("sidebar-nav");
    if (!nav) return;

    const rol = state.usuarioActual?.rol || "admin";

    // Mostramos quien esta conectado y su rol en la cabecera del menu.
    const infoUsuario = document.getElementById("sidebar-usuario");
    if (infoUsuario) {
        const nombre = state.usuarioActual?.nombre || state.usuarioActual?.usuario || "Usuario";
        infoUsuario.textContent = `${nombre} · ${rol}`;
    }

    const permitidos = ITEMS_MENU.filter(item => item.roles.includes(rol));

    // Generamos un <button> por cada item permitido.
    nav.innerHTML = permitidos.map(item => `
        <button class="nav-item" data-panel="${item.panel}">
            <span class="nav-icono">${item.icono}</span>
            <span>${item.texto}</span>
        </button>
    `).join("");

    // Al hacer clic en un item, abrimos su panel y cerramos el sidebar (movil).
    nav.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
            mostrarPanel(btn.dataset.panel);
            cerrarSidebar();
        });
    });

    // Abrimos el primer panel permitido como pantalla de inicio.
    const primero = permitidos[0]?.panel || "panel-inventario";
    mostrarPanel(primero);
}

// ----------------------------------------------------------------------------
//  mostrarPanel(id)
//  Oculta TODOS los paneles y muestra solo el indicado.
//  Tambien resalta el item activo del menu.
// ----------------------------------------------------------------------------
export function mostrarPanel(id) {
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    const objetivo = document.getElementById(id);
    if (objetivo) objetivo.classList.remove("hidden");

    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.panel === id);
    });
}

// ----------------------------------------------------------------------------
//  abrirSidebar() / cerrarSidebar()
//  Controlan la apertura/cierre del menu lateral (pensado para pantallas
//  pequenas, donde el sidebar se desliza desde la izquierda).
// ----------------------------------------------------------------------------
export function abrirSidebar() {
    document.getElementById("sidebar")?.classList.add("open");
    document.getElementById("overlay-sidebar")?.classList.add("visible");
}

export function cerrarSidebar() {
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("overlay-sidebar")?.classList.remove("visible");
}

// ----------------------------------------------------------------------------
//  aplicarPermisosPorRol()
//  Ajusta la interfaz segun el rol (por si algo quedo visible de mas).
//  Se llama justo despues de iniciar sesion.
// ----------------------------------------------------------------------------
export function aplicarPermisosPorRol() {
    // El boton de "Salir" del topbar funciona para todos.
    // Aqui podriamos ocultar elementos especificos de admin si hace falta;
    // por ahora el menu lateral ya limita que ve cada quien.
}

// ----------------------------------------------------------------------------
//  registrarEntradaSesion()
//  Crea una fila en `sesiones` con la hora de ENTRADA del usuario.
//  Guarda el id de esa fila en state.sesionId para poder marcar la salida.
// ----------------------------------------------------------------------------
export async function registrarEntradaSesion() {
    if (!state.usuarioActual || !db) return;

    const ahora = new Date();
    const fecha = `${ahora.toLocaleDateString("es-VE")} ${ahora.toLocaleTimeString("es-VE")}`;

    const { data, error } = await db
        .from("sesiones")
        .insert([{
            usuario: state.usuarioActual.usuario,
            rol: state.usuarioActual.rol,
            fecha_entrada: fecha,
            fecha_salida: null,
            notas: "",
        }])
        .select("id")
        .single();

    if (error) {
        console.warn("No se pudo registrar la entrada de sesion:", error.message);
        return;
    }

    state.sesionId = data ? data.id : null;
}

// ----------------------------------------------------------------------------
//  registrarSalidaSesion()
//  Marca la hora de SALIDA en la fila de sesion activa (state.sesionId).
// ----------------------------------------------------------------------------
export async function registrarSalidaSesion() {
    if (!state.sesionId || !db) return;

    const ahora = new Date();
    const fecha = `${ahora.toLocaleDateString("es-VE")} ${ahora.toLocaleTimeString("es-VE")}`;

    const { error } = await db
        .from("sesiones")
        .update({ fecha_salida: fecha })
        .eq("id", state.sesionId);

    if (error) {
        console.warn("No se pudo registrar la salida de sesion:", error.message);
    }

    state.sesionId = null;
}

// ----------------------------------------------------------------------------
//  cerrarSesion()
//  Flujo completo de cierre de sesion:
//    1) Registrar hora de salida.
//    2) Limpiar el estado del usuario.
//    3) Mostrar la pantalla de salida.
// ----------------------------------------------------------------------------
export async function cerrarSesion() {
    await registrarSalidaSesion();
    state.usuarioActual = null;
    state.listaVenta = [];
    mostrarPantalla("exit");
}

// ----------------------------------------------------------------------------
//  cargarSesiones()
//  Trae el historial de entradas/salidas desde Supabase (solo lo usa el admin).
// ----------------------------------------------------------------------------
export async function cargarSesiones() {
    if (!db) return false;

    const { data, error } = await db
        .from("sesiones")
        .select("id, usuario, rol, fecha_entrada, fecha_salida, notas")
        .order("id", { ascending: false });

    if (error) {
        console.warn("Error cargando sesiones:", error.message);
        return false;
    }

    state.sesiones = data || [];
    return true;
}

// ----------------------------------------------------------------------------
//  inicializarSesion()
//  Conecta los botones del menu (hamburguesa, overlay) con sus acciones.
//  Se llama una sola vez al arrancar la aplicacion.
// ----------------------------------------------------------------------------
export function inicializarSesion() {
    document.getElementById("btn-menu")?.addEventListener("click", abrirSidebar);
    document.getElementById("overlay-sidebar")?.addEventListener("click", cerrarSidebar);
    document.getElementById("btn-cerrar-sesion")?.addEventListener("click", () => {
        cerrarSesion().then(() => mostrarAlerta("Sesion finalizada.", "ok"));
    });
}
