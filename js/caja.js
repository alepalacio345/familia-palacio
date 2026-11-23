// ============================================================================
//  caja.js - MODULO DE DINERO / CAJA (ingresos y gastos)
// ============================================================================
//  Este modulo deja al ADMIN controlar el dinero real del negocio:
//
//    * INGRESOS: el dinero que entra (ej. lo que trae la revendedora).
//    * GASTOS:   lo que se paga (sueldo, transporte, comida, imprevistos...).
//    * SALDO:    ingresos - gastos = cuanto queda en total.
//
//  Cada movimiento tiene un NOMBRE (a quien o de que es) y un MOTIVO
//  (Sueldo, Transporte, Comida, Imprevistos... o "Otro" para uno propio).
//
//  Los montos se guardan en DOLARES (base) y se muestran tambien en
//  BOLIVARES usando la tasa actual. Solo el admin ve y usa este modulo.
// ============================================================================

import { db } from "./config.js";
import { state } from "./state.js";
import { obtenerTasa } from "./tasas.js";
import { mostrarAlerta, renderizarTodo } from "./ui.js";

// ----------------------------------------------------------------------------
// Motivos PREDETERMINADOS, separados por tipo.
//  "Otro" permite escribir un motivo personalizado en un campo extra.
// ----------------------------------------------------------------------------
export const MOTIVOS_INGRESO = [
    "Ventas",
    "Ingreso de la revendedora",
    "Otro",
];

export const MOTIVOS_GASTO = [
    "Sueldo",
    "Adelanto de sueldo",
    "Transporte",
    "Comida",
    "Imprevistos",
    "Gasto adicional",
    "Otro",
];

// ----------------------------------------------------------------------------
// cargarCaja()
// Trae todos los movimientos de dinero desde Supabase.
// ----------------------------------------------------------------------------
export async function cargarCaja() {
    const { data, error } = await db
        .from("caja")
        .select("id, tipo, nombre, motivo, moneda, monto, monto_usd, monto_bs, tasa, fecha, usuario")
        .order("creado_en", { ascending: false });

    if (error) {
        mostrarAlerta(`Error cargando la caja: ${error.message}`, "err");
        return false;
    }

    state.caja = (data || []).map(m => ({
        ...m,
        monto: Number(m.monto ?? 0),
        monto_usd: Number(m.monto_usd ?? 0),
        monto_bs: Number(m.monto_bs ?? 0),
    }));

    return true;
}

// ----------------------------------------------------------------------------
// obtenerFechaFormateada()
// Fecha y hora actual "YYYY-MM-DD HH:mm".
// ----------------------------------------------------------------------------
function obtenerFechaFormateada() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ----------------------------------------------------------------------------
// poblarMotivos()
// Llena el <select> de motivos segun el tipo elegido (ingreso o gasto).
// ----------------------------------------------------------------------------
function poblarMotivos() {
    const tipo = document.getElementById("caja-tipo").value;
    const lista = tipo === "gasto" ? MOTIVOS_GASTO : MOTIVOS_INGRESO;
    const select = document.getElementById("caja-motivo");

    select.innerHTML = lista.map(m => `<option value="${m}">${m}</option>`).join("");
    toggleMotivoOtro();
}

// ----------------------------------------------------------------------------
// toggleMotivoOtro()
// Muestra el campo de "motivo personalizado" solo cuando se elige "Otro".
// ----------------------------------------------------------------------------
function toggleMotivoOtro() {
    const esOtro = document.getElementById("caja-motivo").value === "Otro";
    const grupo = document.getElementById("caja-motivo-otro-group");
    if (grupo) grupo.classList.toggle("hidden", !esOtro);
}

// ----------------------------------------------------------------------------
// inicializarCaja()
// Conecta los controles del modulo de caja (formulario, motivos y eliminar).
// ----------------------------------------------------------------------------
export function inicializarCaja() {
    // --- Al cambiar el tipo, cambian los motivos disponibles ---
    document.getElementById("caja-tipo").addEventListener("change", poblarMotivos);
    document.getElementById("caja-motivo").addEventListener("change", toggleMotivoOtro);

    // Cargar los motivos iniciales (por defecto tipo = ingreso).
    poblarMotivos();

    // --- Guardar un nuevo movimiento ---
    document.getElementById("btn-agregar-caja").addEventListener("click", async () => {
        const tipo = document.getElementById("caja-tipo").value;         // ingreso | gasto
        const nombre = document.getElementById("caja-nombre").value.trim().replace(/\|/g, " ");
        let motivo = document.getElementById("caja-motivo").value;
        const moneda = document.getElementById("caja-moneda").value;     // USD | VES
        const monto = parseFloat(document.getElementById("caja-monto").value);

        // Si el motivo es "Otro", leemos el texto personalizado.
        if (motivo === "Otro") {
            const otro = document.getElementById("caja-motivo-otro").value.trim();
            if (!otro) {
                mostrarAlerta("Escribe el motivo personalizado.", "err");
                return;
            }
            motivo = otro;
        }

        if (!nombre || isNaN(monto) || monto <= 0) {
            mostrarAlerta("Completa el nombre y un monto valido.", "err");
            return;
        }

        // Convertimos el monto a USD (base) y calculamos el equivalente en Bs.
        const tasaVes = obtenerTasa("VES");
        let montoUsd, montoBs;
        if (moneda === "VES") {
            // El usuario escribio bolivares: lo pasamos a dolares.
            montoBs = Number(monto.toFixed(2));
            montoUsd = tasaVes ? Number((monto / tasaVes).toFixed(2)) : Number(monto.toFixed(2));
        } else {
            // El usuario escribio dolares: calculamos los bolivares.
            montoUsd = Number(monto.toFixed(2));
            montoBs = tasaVes ? Number((monto * tasaVes).toFixed(2)) : 0;
        }

        const nuevo = {
            tipo,
            nombre,
            motivo,
            moneda,
            monto: Number(monto.toFixed(2)),
            monto_usd: montoUsd,
            monto_bs: montoBs,
            tasa: tasaVes ?? 0,
            fecha: obtenerFechaFormateada(),
            usuario: state.usuarioActual?.usuario || "admin",
        };

        const { error } = await db.from("caja").insert([nuevo]);
        if (error) {
            mostrarAlerta(`Error guardando el movimiento: ${error.message}`, "err");
            return;
        }

        // Limpiamos los campos y recargamos.
        document.getElementById("caja-nombre").value = "";
        document.getElementById("caja-monto").value = "";
        document.getElementById("caja-motivo-otro").value = "";
        await cargarCaja();
        renderizarTodo();
        mostrarAlerta("Movimiento guardado en la caja.", "ok");
    });

    // --- Eliminar un movimiento del historial ---
    document.getElementById("tbody-caja").addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action='del-caja']");
        if (!btn) return;

        const { error } = await db.from("caja").delete().eq("id", btn.dataset.id);
        if (error) {
            mostrarAlerta(`Error eliminando el movimiento: ${error.message}`, "err");
            return;
        }

        await cargarCaja();
        renderizarTodo();
        mostrarAlerta("Movimiento eliminado de la caja.", "ok");
    });
}
