// ============================================================================
//  tasas.js - TASAS DE CAMBIO Y CONVERSION DE MONEDA
// ============================================================================
//  Este modulo se encarga de:
//    1) Obtener la tasa de cambio actual (Bs por dolar) del BANCO CENTRAL
//       DE VENEZUELA (BCV) a traves de un espejo publico (DolarAPI).
//    2) Obtener los cruces de cambio para Euro, Rupia y Yuan usando una API
//       gratuita de tipo de cambio (open.er-api.com).
//    3) Convertir cualquier precio en dolares a la moneda elegida.
//    4) Dar formato bonito a los montos con su simbolo.
//
//  ¿DE DONDE SALE LA TASA?
//  -------------------------------------------------------------------------
//  El BCV publica su tasa oficial cada dia en su pagina web (bcv.org.ve),
//  pero NO ofrece una API JSON publica que un navegador pueda consultar
//  directamente (no tiene CORS habilitado). Por eso usamos un "espejo"
//  confiable que lee la tasa oficial del BCV y la vuelve a publicar:
//
//     * https://ve.dolarapi.com/v1/dolares/oficial
//         -> devuelve { ..., "promedio": 918.76, ... }
//         -> ese "promedio" ES la tasa oficial del BCV (Bs por USD).
//
//  Para las demas monedas (Euro, Rupia, Yuan) usamos:
//
//     * https://open.er-api.com/v6/latest/USD
//         -> devuelve { "rates": { "USD":1, "EUR":0.91, "INR":92.7, "CNY":6.68, ... } }
//         -> es gratis, no pide llave y permite CORS.
//
//  Si el espejo del BCV falla, usamos la tasa VES de open.er-api.com como
//  respaldo para que la aplicacion nunca se quede sin precio.
// ============================================================================

import { state } from "./state.js";

// ----------------------------------------------------------------------------
// Catalogo de monedas soportadas.
//  - codigo:  codigo ISO de la moneda (se guarda en la base de datos).
//  - simbolo: simbolo corto que se muestra junto al monto.
//  - nombre:  nombre amigable para el usuario.
// ----------------------------------------------------------------------------
export const MONEDAS = [
    { codigo: "USD", simbolo: "$",  nombre: "Dolar (base)" },
    { codigo: "VES", simbolo: "Bs", nombre: "Bolivares (BCV)" },
    { codigo: "EUR", simbolo: "€",  nombre: "Euro" },
    { codigo: "INR", simbolo: "₹",  nombre: "Rupia" },
    { codigo: "CNY", simbolo: "¥",  nombre: "Yuan" },
];

// ----------------------------------------------------------------------------
// Devuelve el objeto de una moneda a partir de su codigo (o null si no existe).
// ----------------------------------------------------------------------------
export function obtenerMoneda(codigo) {
    return MONEDAS.find(m => m.codigo === codigo) || MONEDAS[0];
}

// ----------------------------------------------------------------------------
// Devuelve la tasa de cambio de una moneda (cuanto vale 1 USD en esa moneda).
//   * USD siempre vale 1 (es la base).
//   * Si no hay tasa cargada todavia, devuelve null.
// ----------------------------------------------------------------------------
export function obtenerTasa(codigo) {
    if (codigo === "USD") return 1;
    const tasa = state.tasas[codigo];
    return (tasa === undefined || tasa === null) ? null : Number(tasa);
}

// ----------------------------------------------------------------------------
// Convierte un monto EN DOLARES a la moneda indicada.
//   Ej: convertirDesdeUsd(130, "VES") con tasa 918.76 -> 119438.80
// ----------------------------------------------------------------------------
export function convertirDesdeUsd(usd, codigo) {
    const base = Number(usd || 0);
    const tasa = obtenerTasa(codigo);
    // Si la moneda es USD o no tenemos tasa, devolvemos el valor tal cual.
    if (codigo === "USD" || tasa === null) return base;
    return Number((base * tasa).toFixed(2));
}

// ----------------------------------------------------------------------------
// Convierte un monto en la moneda indicada DE VUELTA a dolares.
//   (util cuando la revendedora cobra en Bs y queremos guardar el total USD)
// ----------------------------------------------------------------------------
export function convertirAUsd(monto, codigo) {
    const base = Number(monto || 0);
    const tasa = obtenerTasa(codigo);
    if (codigo === "USD" || !tasa) return base;
    return Number((base / tasa).toFixed(2));
}

// ----------------------------------------------------------------------------
// Formatea un monto con su simbolo y separadores de miles (formato es-VE).
//   Ej: formatearMonto(119438.80, "VES") -> "Bs119.438,80"
// ----------------------------------------------------------------------------
export function formatearMonto(monto, codigo) {
    const moneda = obtenerMoneda(codigo);
    const valor = Number(monto || 0).toLocaleString("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${moneda.simbolo}${valor}`;
}

// ----------------------------------------------------------------------------
// CARGA LAS TASAS DE CAMBIO.
//  Paso 1: intenta traer la tasa oficial del BCV (espejo DolarAPI).
//  Paso 2: trae los cruces EUR/INR/CNY (+ respaldo VES) desde open.er-api.com.
//  Al final guarda todo en state.tasas y lo devuelve.
//  Devuelve false si NO se pudo cargar ninguna tasa util.
// ----------------------------------------------------------------------------
export async function cargarTasas() {
    // --- Paso 1: tasa BCV (Bolivares) desde el espejo DolarAPI ---
    let tasaBcv = null;
    try {
        const respuesta = await fetch("https://ve.dolarapi.com/v1/dolares/oficial");
        if (respuesta.ok) {
            const datos = await respuesta.json();
            const promedio = Number(datos && datos.promedio);
            if (promedio > 0) tasaBcv = promedio;
        }
    } catch (e) {
        // Si falla la red o el espejo, seguimos con el respaldo mas abajo.
        console.warn("No se pudo obtener la tasa BCV:", e);
    }

    // --- Paso 2: cruces (EUR, INR, CNY) + respaldo VES desde er-api ---
    let cruces = {};
    try {
        const respuesta = await fetch("https://open.er-api.com/v6/latest/USD");
        if (respuesta.ok) {
            const datos = await respuesta.json();
            if (datos && datos.result === "success" && datos.rates) {
                cruces = datos.rates;
            }
        }
    } catch (e) {
        console.warn("No se pudo obtener los cruces de cambio:", e);
    }

    // --- Paso 3: elegimos la mejor tasa para cada moneda ---
    const vesFinal = tasaBcv !== null
        ? tasaBcv                                  // Preferimos el BCV para Bs.
        : (cruces.VES ? Number(cruces.VES) : null); // Respaldo.

    state.tasas = {
        USD: 1,
        VES: vesFinal,
        EUR: cruces.EUR ? Number(cruces.EUR) : null,
        INR: cruces.INR ? Number(cruces.INR) : null,
        CNY: cruces.CNY ? Number(cruces.CNY) : null,
        actualizado: new Date().toISOString(),
        // Guardamos de que fuente salio la tasa de Bs para mostrarla en pantalla.
        fuente: tasaBcv !== null ? "BCV (espejo DolarAPI)" : "open.er-api.com",
    };

    // Devolvemos true si al menos tenemos la tasa de dolares (siempre) y
    // alguna tasa real de cambio cargada.
    return vesFinal !== null || cruces.EUR !== undefined;
}

// ----------------------------------------------------------------------------
// Devuelve un texto corto para mostrar la tasa activa en la barra superior.
//   Ej: "BCV: Bs918,77 | EUR 0,91 | INR 92,75 | CNY 6,68"
// ----------------------------------------------------------------------------
export function textoResumenTasas() {
    const t = state.tasas;
    const partes = [];
    if (t.VES !== null) partes.push(`Bs${Number(t.VES).toFixed(2)}`);
    if (t.EUR !== null) partes.push(`€${Number(t.EUR).toFixed(2)}`);
    if (t.INR !== null) partes.push(`₹${Number(t.INR).toFixed(2)}`);
    if (t.CNY !== null) partes.push(`¥${Number(t.CNY).toFixed(2)}`);
    const resumen = partes.length ? partes.join(" · ") : "tasas no disponibles";
    const hora = t.actualizado
        ? new Date(t.actualizado).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })
        : "";
    return `${resumen}${hora ? ` (${hora})` : ""}`;
}
